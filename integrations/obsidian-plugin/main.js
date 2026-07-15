const { Plugin } = require('obsidian')
module.exports = class CutoutBridgePlugin extends Plugin {
  async onload() {
    this.addCommand({ id: 'open-cutout-bridge', name: 'Open Cutout bridge', callback: () => {
      this.app.workspace.trigger('cutout:bridge-handshake', { protocol: 'cutout.surface-handshake.v1', kind: 'obsidian-vault-plugin', foreground: true, capabilities: ['read', 'preview', 'write'] })
    } })
  }
}
