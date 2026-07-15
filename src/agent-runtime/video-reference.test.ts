import { describe,expect,it } from 'vitest'
import { segmentShots } from './video-reference'
const frame=(id:string,atMs:number,perceptualHash:string)=>({id,atMs,perceptualHash,sha256:'a'.repeat(64),width:100,height:100})
describe('video shot segmentation',()=>{it('creates ordered shots from perceptual discontinuities',()=>{const shots=segmentShots([frame('a',0,'0000'),frame('b',1000,'0001'),frame('c',2000,'1111')],3000,.5);expect(shots).toEqual([expect.objectContaining({startMs:0,endMs:2000,frameIds:['a','b']}),expect.objectContaining({startMs:2000,endMs:3000,frameIds:['c']})])})})
