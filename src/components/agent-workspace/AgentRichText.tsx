import { RichText } from '@/components/rich-text/RichText'

export function AgentRichText({ markdown }: { readonly markdown: string }) {
  return <RichText markdown={markdown} variant="message" />
}
