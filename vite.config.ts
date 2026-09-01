import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { MONTHS } from './src/core/house/month.ts'

// ── Edit mode's save button, server side ────────────────────────────────────
//
// `configureServer` runs in `vite dev` and nowhere else, so this endpoint
// cannot exist in a build. That is the whole reason edit mode is dev-only: it
// writes to the source tree, and a production bundle has no source tree to
// write to.
//
// It is deliberately dumb. The interesting work — turning a plan into
// TypeScript — is a pure function in core/edit/emit.ts with its own tests; this
// takes the string it produced and puts it on disk. Everything a bug here could
// do is limited by the one check below.
//
// THE ONE CHECK: `month` must be a member of the closed union. Without it,
// `../../../etc/whatever` is a month, and a dev server that writes an arbitrary
// path is a dev server that writes an arbitrary path. Matching against MONTHS
// rather than sanitising the string means a name that isn't one of the twelve
// is rejected outright rather than repaired into something.
function editSave(): Plugin {
  const monthsDir = fileURLToPath(new URL('./src/content/months/', import.meta.url))
  return {
    name: 'lingo-house-edit-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__edit/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const reply = (code: number, body: unknown) => {
            res.statusCode = code
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(body))
          }
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              month?: unknown
              source?: unknown
            }
            const month = MONTHS.find((m) => m === body.month)
            if (month === undefined) {
              reply(400, { error: `not a month: ${String(body.month)}` })
              return
            }
            if (typeof body.source !== 'string' || body.source.length === 0) {
              reply(400, { error: 'source must be a non-empty string' })
              return
            }
            const path = `${monthsDir}${month}.ts`
            writeFileSync(path, body.source)
            reply(200, { path: `src/content/months/${month}.ts` })
          } catch (e) {
            reply(500, { error: e instanceof Error ? e.message : String(e) })
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), editSave()],

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['.app.github.dev'],  // leading dot = all subdomains
  },
})
