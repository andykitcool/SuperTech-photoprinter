const { spawn } = require('node:child_process')
const electron = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// Use 'ignore' for stdio — Electron is a GUI app that has its own window.
// Inheriting parent stdio causes EPIPE crashes when the calling terminal
// closes before Electron exits.
const child = spawn(electron, process.argv.slice(2), {
  env,
  stdio: 'ignore',
  windowsHide: false,
})

child.on('close', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
