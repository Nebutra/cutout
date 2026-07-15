figma.showUI(__html__, { visible: false })
const SESSION = `figma-${Date.now().toString(36)}`
figma.ui.postMessage({ type: 'cutout-handshake', protocol: 'cutout.figma-plugin.v1', sessionId: SESSION, editorType: figma.editorType })
figma.ui.onmessage = async (message) => {
  if (!message || message.protocol !== 'cutout.figma-plugin.v1' || message.sessionId !== SESSION) return
  if (message.type === 'close') { figma.closePlugin(message.summary || 'Cutout bridge closed.'); return }
  if (message.type !== 'inspect') return
  const results = []
  for (const expected of message.nodes || []) {
    const node = await figma.getNodeByIdAsync(expected.nodeId)
    results.push({ nodeId: expected.nodeId, actualType: node?.type || 'MISSING', exists: Boolean(node) })
  }
  figma.ui.postMessage({ type: 'cutout-inspection', protocol: 'cutout.figma-plugin.v1', sessionId: SESSION, requestId: message.requestId, nodes: results })
}
