// src/render/edit/EditScene.tsx
//
// Edit mode: place doors, windows and furniture on a month's plan, and write
// the result back to that month's file.
//
// DEV ONLY, and enforced twice over. App won't offer the tab unless
// import.meta.env.DEV, and the save endpoint is a vite plugin with
// apply:'serve' so it cannot exist in a build at all. The second one is the
// real guarantee: edit mode writes to the source tree, and a deployed bundle
// has no source tree.
//
// MONTHS WORK EXACTLY AS THEY DO IN THE HOUSE. Pick January and you are editing
// January; pick February and you are editing February. The picker is the same
// component. There is no fork-from prompt, because a month already inherits the
// base plan until it is saved (see content/furnish.ts) — so "editing February"
// starts from the base house without anyone having to choose that.
//
// WHAT IS EDITABLE: openings and items. Not the room grid, not the stairs. A
// room carries labels in three languages and a stair rewrites the storey above
// it; both are decisions with consequences a drag cannot show you. Furniture
// and doorways are placements, and the worst a bad one does is fail to compile
// — which this shows you, before you save, in the same words the app shows.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { compileHouse, houseExtent, type CompiledHouse } from '../../core/house/house';
import { houseFor } from '../../content/house';
import { LABELS } from '../../content/labels';
import { MONTHS, type Month } from '../../core/house/month';
import { describeError } from '../../core/shared/errors';
import { gridFrame, floorMountAt } from '../../core/house/frame';
import { applyEdit, itemsOn, mountOnto, nextItemId, openingsOn, slotsOf } from '../../core/edit/plan';
import { edgeKey, wallEdges, type WallEdge } from '../../core/edit/edges';
import { emitMonthFile } from '../../core/edit/emit';
import { ITEM_SPECS, openPartsOf } from '../../core/house/items';
import type { Facing, ItemKind, Mount, Storey } from '../../core/house/blocks';
import { MonthBar } from '../ui/MonthBar';
import { PlanView, type Hit } from './PlanView';

const KINDS = Object.keys(ITEM_SPECS) as readonly ItemKind[];
const FACINGS: readonly Facing[] = ['n', 'e', 's', 'w'];

// What a click does. A closed union rather than a set of booleans, so "placing
// a door" and "placing a sofa" cannot both be true.
type Tool =
  | { readonly t: 'select' }
  | { readonly t: 'item'; readonly kind: ItemKind }
  | { readonly t: 'opening'; readonly kind: 'door' | 'window' };

type SaveState = { readonly s: 'idle' } | { readonly s: 'saving' } | { readonly s: 'done'; readonly path: string } | { readonly s: 'failed'; readonly why: string };

const panel: CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 280,
  overflowY: 'auto',
  padding: '64px 14px 14px',
  boxSizing: 'border-box',
  background: 'rgba(17, 24, 39, 0.93)',
  color: '#e8e2d6',
  font: '13px/1.45 ui-sans-serif, system-ui',
};

const h = (top = 14): CSSProperties => ({
  margin: `${String(top)}px 0 6px`,
  font: '600 11px/1 ui-sans-serif, system-ui',
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: '#9aa3b2',
});

const chip = (active: boolean): CSSProperties => ({
  padding: '4px 8px',
  margin: '0 4px 4px 0',
  borderRadius: 5,
  border: 'none',
  cursor: 'pointer',
  font: '12px ui-sans-serif, system-ui',
  background: active ? '#b5503f' : 'rgba(255,255,255,0.12)',
  color: active ? '#fff' : '#e8e2d6',
});

const wide = (bg: string): CSSProperties => ({
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  marginTop: 8,
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  font: '600 13px ui-sans-serif, system-ui',
  background: bg,
  color: '#fff',
});

export function EditScene() {
  const [month, setMonth] = useState<Month>(MONTHS[0]);
  const [plan, setPlan] = useState<readonly Storey[]>(() => houseFor(MONTHS[0]));
  const [level, setLevel] = useState(0);
  const [tool, setTool] = useState<Tool>({ t: 'select' });
  const [item, setItem] = useState<string | null>(null);
  const [edge, setEdge] = useState<WallEdge | null>(null);
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>({ s: 'idle' });
  const [past, setPast] = useState<readonly (readonly Storey[])[]>([]);
  // The last action's coalescing key. A drag fires an edit per pointer move,
  // and an undo stack that recorded every one of them would need forty presses
  // to put a sofa back — so consecutive edits that say the same thing about the
  // same item collapse into one entry.
  const coalescing = useRef<string | null>(null);

  const edit = (next: readonly Storey[], coalesceAs?: string) => {
    setPast((p) =>
      coalesceAs !== undefined && coalesceAs === coalescing.current ? p : [...p, plan].slice(-60),
    );
    coalescing.current = coalesceAs ?? null;
    setPlan(next);
    setDirty(true);
    setSave({ s: 'idle' });
  };

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      setPlan(p[p.length - 1]);
      setDirty(true);
      setSave({ s: 'idle' });
      coalescing.current = null;
      return p.slice(0, -1);
    });
  }, []);

  // Switching months LOADS that month. Unsaved work on the old one is gone, so
  // it asks — a month picker that silently discards ten minutes of furniture
  // arranging is worse than one that interrupts.
  const pickMonth = (m: Month) => {
    if (dirty && !confirm(`Discard unsaved changes to ${month}?`)) return;
    setMonth(m);
    setPlan(houseFor(m));
    setItem(null);
    setEdge(null);
    setDirty(false);
    setSave({ s: 'idle' });
    setPast([]);
  };

  const compiled = useMemo(() => compileHouse(plan), [plan]);

  // A plan that does not compile has no geometry, so there is nothing to draw —
  // and a blank canvas is a dead end: the item you just dragged into a wall is
  // the thing you need to grab to drag it back out. So the last plan that DID
  // compile stays on screen, clearly marked as stale, and undo is what gets you
  // out. The ref updates in an effect rather than during render, which is
  // exactly what makes it hold the previous value on the render that failed.
  const lastGood = useRef<CompiledHouse | null>(null);
  useEffect(() => {
    if (compiled.ok) lastGood.current = compiled.value;
  }, [compiled]);
  const shown = compiled.ok ? compiled.value : lastGood.current;
  // The frame is the HOUSE's, never the storey's — see frame.ts. Getting this
  // from the plan rather than from the compiled storey is what keeps a setback
  // from putting every upstairs item half a cell out.
  const frame = useMemo(() => {
    const e = houseExtent(plan);
    return gridFrame(e.rows, e.cols);
  }, [plan]);

  const storeyPlan = plan.find((s) => s.level === level) ?? plan[0];
  const edges = useMemo(() => wallEdges(storeyPlan.grid, frame), [storeyPlan, frame]);
  const storey = shown?.storeys.find((s) => s.level === level);

  const selectedItem = itemsOn(plan, level).find((i) => i.id === item) ?? null;
  const selectedOpening =
    edge === null ? null : (openingsOn(plan, level).find((o) => edgeKey(o.cell, o.side) === edge.key) ?? null);

  /** Place a new item of the armed kind, and select it. */
  const place = (mount: Mount, kind: ItemKind) => {
    const id = nextItemId(plan, kind);
    edit(applyEdit(plan, { tag: 'addItem', level, item: { id, kind, mount } }));
    setItem(id);
    // Back to select, so a click doesn't scatter a second sofa every time you
    // mean to deselect.
    setTool({ t: 'select' });
  };

  const onHit = (hit: Hit) => {
    switch (hit.on) {
      case 'item': {
        setEdge(null);
        // With the palette armed, clicking an item means PUT IT ON THAT — a
        // lamp on a nightstand, a cup in a cupboard. Without a host you could
        // only ever author floor mounts here, which is most of the mount model
        // unreachable from the surface built to author it.
        const host = tool.t === 'item' ? itemsOn(plan, level).find((i) => i.id === hit.id) : undefined;
        const slot = host === undefined ? undefined : slotsOf(host.kind)[0];
        const mount = host !== undefined && slot !== undefined ? mountOnto(host, slot) : null;
        if (tool.t === 'item' && mount !== null) {
          place(mount, tool.kind);
          return;
        }
        // Either nothing armed, or a host that can hold nothing — select it, so
        // clicking a rug with a lamp armed does something obvious rather than
        // failing silently.
        setItem(hit.id);
        return;
      }
      case 'edge': {
        setItem(null);
        setEdge(hit.edge);
        if (tool.t !== 'opening') return;
        const has = openingsOn(plan, level).some((o) => edgeKey(o.cell, o.side) === hit.edge.key);
        if (has) return; // one opening per edge — the compiler's rule, honoured here
        edit(
          applyEdit(plan, {
            tag: 'addOpening',
            level,
            opening:
              tool.kind === 'door'
                ? { kind: 'door', cell: hit.edge.cell, side: hit.edge.side, swing: 'in', between: hit.edge.between }
                : { kind: 'window', cell: hit.edge.cell, side: hit.edge.side, sill: 0.45, head: 0.95, between: hit.edge.between },
          }),
        );
        return;
      }
      case 'floor': {
        setItem(null);
        setEdge(null);
        if (tool.t !== 'item') return;
        const { cell, offset } = floorMountAt(frame, hit.at[0], hit.at[1]);
        place({ on: 'floor', cell, offset, facing: 's' }, tool.kind);
        return;
      }
    }
  };

  const dragItem = (id: string, at: readonly [number, number]) => {
    const def = itemsOn(plan, level).find((i) => i.id === id);
    if (def === undefined || def.mount.on !== 'floor') return;
    const { cell, offset } = floorMountAt(frame, at[0], at[1]);
    edit(applyEdit(plan, { tag: 'setMount', level, id, mount: { ...def.mount, cell, offset } }), `drag:${id}`);
  };

  const reMount = (id: string, mount: Mount | null) => {
    if (mount === null) return;
    edit(applyEdit(plan, { tag: 'setMount', level, id, mount }));
  };

  /**
   * Take a hosted item off its host and stand it on the floor where it already
   * is — which is what makes hosting reversible without deleting anything.
   * Its compiled position is a world point, so frame.ts turns that straight
   * back into the cell and offset that puts it in the same place.
   */
  const detach = (id: string) => {
    const placed = storey?.grid.items.find((i) => i.id === id);
    if (placed === undefined) return;
    const { cell, offset } = floorMountAt(frame, placed.position[0], placed.position[2]);
    reMount(id, { on: 'floor', cell, offset, facing: 's' });
  };

  const setFacing = (f: Facing) => {
    if (selectedItem === null || selectedItem.mount.on === 'wall') return;
    edit(applyEdit(plan, { tag: 'setMount', level, id: selectedItem.id, mount: { ...selectedItem.mount, facing: f } }));
  };

  const remove = () => {
    if (selectedItem !== null) {
      edit(applyEdit(plan, { tag: 'removeItem', level, id: selectedItem.id }));
      setItem(null);
    } else if (selectedOpening !== null) {
      edit(applyEdit(plan, { tag: 'removeOpening', level, cell: selectedOpening.cell, side: selectedOpening.side }));
      setEdge(null);
    }
  };

  const write = () => {
    setSave({ s: 'saving' });
    fetch('/__edit/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ month, source: emitMonthFile(month, plan) }),
    })
      .then(async (r) => {
        const body = (await r.json()) as { path?: string; error?: string };
        if (!r.ok) throw new Error(body.error ?? `HTTP ${String(r.status)}`);
        setSave({ s: 'done', path: body.path ?? '' });
        setDirty(false);
      })
      .catch((e: unknown) => {
        setSave({ s: 'failed', why: e instanceof Error ? e.message : String(e) });
      });
  };

  // Delete and undo from the keyboard, because both are things you reach for
  // mid-drag. `remove` is re-read through a ref rather than listed as a
  // dependency, so the listener isn't torn down and rebuilt on every edit.
  const removeRef = useRef(remove);
  removeRef.current = remove;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [undo]);

  const levels = plan.map((s) => s.level).sort((a, b) => a - b);

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, right: 280 }}>
        {storey ? (
          <PlanView
            storey={storey}
            stairs={shown?.stairs ?? []}
            edges={edges}
            selection={{ item, edgeKey: edge?.key ?? null }}
            showEdges={tool.t === 'opening'}
            onHit={onHit}
            onDragItem={dragItem}
          />
        ) : (
          <div style={{ padding: 80, font: '14px ui-sans-serif, system-ui', color: '#7a2e22' }}>
            Nothing to draw yet — see the panel.
          </div>
        )}
        {!compiled.ok && storey && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: '8px 14px',
              background: '#7a2e22',
              color: '#fff',
              font: '600 12px ui-sans-serif, system-ui',
            }}
          >
            This drawing is the last plan that compiled — your latest change is not in it. Undo
            (Ctrl+Z), or fix what the panel lists.
          </div>
        )}
      </div>

      <MonthBar month={month} onPick={pickMonth} labels={LABELS} from="en" to="es" />

      <div style={panel}>
        <div style={h(0)}>Storey</div>
        {levels.map((l) => (
          <button key={l} type="button" style={chip(l === level)} onClick={() => { setLevel(l); setItem(null); setEdge(null); }}>
            {l === 0 ? 'Ground' : `Level ${String(l)}`}
          </button>
        ))}

        <div style={h()}>Place an opening</div>
        {(['door', 'window'] as const).map((k) => (
          <button
            key={k}
            type="button"
            style={chip(tool.t === 'opening' && tool.kind === k)}
            onClick={() => { setTool(tool.t === 'opening' && tool.kind === k ? { t: 'select' } : { t: 'opening', kind: k }); }}
          >
            {k}
          </button>
        ))}
        {tool.t === 'opening' && (
          <div style={{ color: '#9aa3b2', marginTop: 4 }}>Click a dashed wall segment.</div>
        )}

        <div style={h()}>Place an item</div>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            style={chip(tool.t === 'item' && tool.kind === k)}
            onClick={() => { setTool(tool.t === 'item' && tool.kind === k ? { t: 'select' } : { t: 'item', kind: k }); }}
          >
            {k}
          </button>
        ))}
        {tool.t === 'item' && <div style={{ color: '#9aa3b2', marginTop: 4 }}>Click the floor.</div>}

        <div style={h()}>History</div>
        <button type="button" style={chip(false)} disabled={past.length === 0} onClick={undo}>
          Undo ({String(past.length)})
        </button>

        <div style={h()}>Selected</div>
        {selectedItem !== null && (() => {
          // Pulled out of the JSX so the mount narrows once. Reading
          // `selectedItem.mount.on` in a guard and `selectedItem.mount.facing`
          // in the branch is two reads of a possibly-changing expression, which
          // TypeScript is right not to narrow across.
          const mount = selectedItem.mount;
          return (
            <div>
              <div style={{ marginBottom: 6 }}>
                <strong>{selectedItem.kind}</strong> · {selectedItem.id}
              </div>
              {mount.on === 'floor' ? (
                <div style={{ color: '#9aa3b2' }}>
                  cell [{String(mount.cell[0])}, {String(mount.cell[1])}] · offset [
                  {String(mount.offset?.[0] ?? 0)}, {String(mount.offset?.[1] ?? 0)}]
                </div>
              ) : (
                <div style={{ color: '#9aa3b2' }}>
                  mounted on {mount.on} — drag is off; a wall item slides along its wall and an item
                  on another follows its host.
                </div>
              )}
              {mount.on !== 'wall' && (
                <div style={{ marginTop: 6 }}>
                  {FACINGS.map((f) => (
                    <button key={f} type="button" style={chip((mount.facing ?? 's') === f)} onClick={() => { setFacing(f); }}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
              {(mount.on === 'item' || mount.on === 'inside') && (() => {
                // Which slot of the host, and which shelf. Clicking a host puts
                // things on TOP; this is where you say "in the drawer" instead,
                // and where you get a hosted item back onto the floor without
                // deleting it.
                const host = itemsOn(plan, level).find((i) => i.id === mount.host);
                const slots = host === undefined ? [] : slotsOf(host.kind);
                // The part a slot refers to: 'inside' means the host's first
                // openable part, the same one clicking a host puts things in.
                const part = host === undefined ? null : (openPartsOf(host.kind)[0] ?? null);
                const shelves = part?.shelves ?? [];
                return (
                  <div style={{ marginTop: 6 }}>
                    {slots.map((sl) => (
                      <button
                        key={sl}
                        type="button"
                        style={chip((mount.on === 'inside' ? 'inside' : 'top') === sl)}
                        onClick={() => { if (host) reMount(selectedItem.id, mountOnto(host, sl)); }}
                      >
                        {sl === 'top' ? 'on top' : 'inside'}
                      </button>
                    ))}
                    {mount.on === 'inside' &&
                      shelves.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          style={chip((mount.shelf ?? 0) === i)}
                          onClick={() => { if (host) reMount(selectedItem.id, mountOnto(host, 'inside', i)); }}
                        >
                          shelf {String(i + 1)}
                        </button>
                      ))}
                    <button
                      type="button"
                      style={chip(false)}
                      onClick={() => { detach(selectedItem.id); }}
                    >
                      to the floor
                    </button>
                  </div>
                );
              })()}
              <button type="button" style={wide('#7a2e22')} onClick={remove}>Delete item</button>
            </div>
          );
        })()}
        {selectedOpening !== null && (
          <div>
            <div style={{ marginBottom: 6 }}>
              <strong>{selectedOpening.kind}</strong> · [{String(selectedOpening.cell[0])},{' '}
              {String(selectedOpening.cell[1])}] {selectedOpening.side}
            </div>
            <button type="button" style={wide('#7a2e22')} onClick={remove}>Delete opening</button>
          </div>
        )}
        {selectedItem === null && selectedOpening === null && (
          <div style={{ color: '#9aa3b2' }}>Nothing. Click an item or an opening.</div>
        )}

        {!compiled.ok && (
          <>
            <div style={h()}>Will not compile</div>
            {compiled.error.map((e, i) => (
              <div key={i} style={{ marginBottom: 6, color: '#f0a89c' }}>{describeError(e)}</div>
            ))}
          </>
        )}

        <div style={h()}>Save</div>
        <div style={{ color: '#9aa3b2' }}>
          Writes src/content/months/{month}.ts. Vite reloads and the House tab shows it.
        </div>
        <button
          type="button"
          style={wide(compiled.ok ? '#2f6f4f' : '#4b5563')}
          disabled={!compiled.ok || save.s === 'saving'}
          onClick={write}
        >
          {save.s === 'saving' ? 'Saving…' : `Save ${month}`}
        </button>
        {save.s === 'done' && <div style={{ color: '#8fd3a8', marginTop: 6 }}>Wrote {save.path}</div>}
        {save.s === 'failed' && <div style={{ color: '#f0a89c', marginTop: 6 }}>{save.why}</div>}
        {!compiled.ok && <div style={{ color: '#f0a89c', marginTop: 6 }}>Fix the errors first — a month file that does not compile breaks the app.</div>}
      </div>
    </>
  );
}
