import anthropic from 'simple-icons/icons/anthropic.svg?raw'
import bytedance from 'simple-icons/icons/bytedance.svg?raw'
import deepgram from 'simple-icons/icons/deepgram.svg?raw'
import deepseek from 'simple-icons/icons/deepseek.svg?raw'
import elevenlabs from 'simple-icons/icons/elevenlabs.svg?raw'
import googlegemini from 'simple-icons/icons/googlegemini.svg?raw'
import lmstudio from 'simple-icons/icons/lmstudio.svg?raw'
import minimax from 'simple-icons/icons/minimax.svg?raw'
import mistralai from 'simple-icons/icons/mistralai.svg?raw'
import moonshotai from 'simple-icons/icons/moonshotai.svg?raw'
import ollama from 'simple-icons/icons/ollama.svg?raw'
import openrouter from 'simple-icons/icons/openrouter.svg?raw'
import qwen from 'simple-icons/icons/qwen.svg?raw'
import replicate from 'simple-icons/icons/replicate.svg?raw'
import vllm from 'simple-icons/icons/vllm.svg?raw'
import openai from '@/assets/provider-brands/openai.svg?raw'
import fal from '@/assets/provider-brands/fal.svg?raw'

export const providerSimpleIconSlugs=['anthropic','bytedance','deepgram','deepseek','elevenlabs','googlegemini','lmstudio','minimax','mistralai','moonshotai','ollama','openrouter','qwen','replicate','vllm'] as const
export const providerSimpleIconAssets:Readonly<Record<(typeof providerSimpleIconSlugs)[number],string>>={anthropic,bytedance,deepgram,deepseek,elevenlabs,googlegemini,lmstudio,minimax,mistralai,moonshotai,ollama,openrouter,qwen,replicate,vllm}
export const providerOfficialIconAssets:Readonly<Record<string,string>>={'openai:logo':openai,'fal:logo':fal}
