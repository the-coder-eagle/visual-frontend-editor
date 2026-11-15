import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({setTimeout,clearTimeout});
vm.runInContext(readFileSync(new URL('../tools.js',import.meta.url),'utf8'),context);
const {createAutosave,imageType,cloneSelected}=context.EagleEditorTools;

test('自动保存串行写入，保存中发生新修改不会被旧结果覆盖',async()=>{
 let value='旧内容',resume,started;const values=[],ready=new Promise(resolve=>{started=resolve;});
 const auto=createAutosave({delay:100000,read:()=>value,write:async data=>{values.push(data);if(values.length===1){started();await new Promise(resolve=>{resume=resolve;});}}});
 auto.touch();const first=auto.flush();await ready;value='新内容';auto.touch();const second=auto.flush();resume();await Promise.all([first,second]);
 assert.deepEqual(values,['旧内容','新内容']);assert.equal(auto.dirty(),false);
});

test('存储写入失败保留未保存状态，明确重试后才清除',async()=>{
 let fail=true;const auto=createAutosave({delay:100000,read:()=>({title:'保留'}),write:async()=>{if(fail)throw Error('QuotaExceededError');}});
 auto.touch();await assert.rejects(auto.flush(),/Quota/);assert.equal(auto.dirty(),true);
 fail=false;await auto.flush();assert.equal(auto.dirty(),false);
});

test('图片按文件签名检查，不把 SVG 或伪装文本当图片导入',()=>{
 assert.equal(imageType(Uint8Array.from([137,80,78,71,13,10,26,10])),'image/png');
 assert.equal(imageType(Uint8Array.from([255,216,255,224])),'image/jpeg');
 assert.equal(imageType(new TextEncoder().encode('RIFF1234WEBP')),'image/webp');
 assert.throws(()=>imageType(new TextEncoder().encode('<svg onload="alert(1)">')),/PNG/);
});

test('复制元素沿用模型 clone 并插入相邻位置，根节点不能复制',()=>{
 const copied={},calls=[],parent={append:(value,options)=>calls.push({value,at:options.at})};
 const selected={parent:()=>parent,index:()=>2,clone:()=>copied};
 const editor={getSelected:()=>selected,select:value=>calls.push(value)};
 assert.equal(cloneSelected(editor),copied);assert.deepEqual(calls,[{value:copied,at:3},copied]);
 editor.getSelected=()=>({parent:()=>null});assert.equal(cloneSelected(editor),undefined);
});

test('恢复工程后继续自动保存；版本快照恢复标题和组件并清空旧撤销栈',async()=>{
 const nodes=new Map(),events={},classes=new Set();let title='示例',project={pages:['sample']},cleared=0,activated=0;
 const element=()=>({value:'',disabled:false,children:[],append(child){this.children.push(child);},replaceChildren(){this.children=[];},close(){this.closed=true;},showModal(){this.open=true;}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 context.document={getElementById:node,createElement:element,addEventListener(){},body:{classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)}}};context.window={addEventListener(){}};
 const db=new Map([['current',{title:'已有作品',project:{pages:['saved']}}]]);
 const editor={on(name,fn){for(const n of name.split(' '))events[n]=fn;},getSelected:()=>null,getWrapper:()=>({}),getProjectData:()=>project,loadProjectData:value=>{project=value;events.update?.();},select(){},UndoManager:{clear(){cleared++;}}};
 const tools=await context.EagleEditorTools.install({editor,getTitle:()=>title,setTitle:value=>{title=value;},activate:()=>activated++,status(){},storageFactory:async()=>({get:async key=>db.get(key),put:async(key,value)=>db.set(key,structuredClone(value))})});
 assert.equal(title,'已有作品');assert.equal(project.pages[0],'saved');assert.equal(activated,1);assert.equal(classes.has('storage-loading'),false);
 project={pages:['changed']};events.update();await tools.autosave.flush();assert.equal(db.get('current').project.pages[0],'changed');
 node('version-name').value='定稿';await node('save-project').onclick();assert.equal(db.get('versions')[0].label,'定稿');
 project={pages:['another']};events.update();await tools.autosave.flush();await node('version-list').children[0].onclick();await tools.autosave.flush();
 assert.equal(project.pages[0],'changed');assert.equal(title,'已有作品');assert.equal(cleared,2);assert.equal(tools.autosave.dirty(),false);
 await tools.snapshot('修改 HTML 前');assert.equal(db.get('versions')[0].label,'修改 HTML 前');assert.equal(db.get('versions')[0].project.pages[0],'changed');
});
