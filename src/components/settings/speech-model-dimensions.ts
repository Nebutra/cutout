import type { ModelDimension } from './model-dimensions'
export const SPEECH_MODEL_DIMENSIONS:readonly ModelDimension[]=[{task:'asr',label:'Speech to text',description:'Transcribe spoken audio with a configured ASR adapter.'},{task:'tts',label:'Text to speech',description:'Create spoken audio with a configured TTS adapter.'}]as const
