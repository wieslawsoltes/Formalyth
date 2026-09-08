/** Right-handed perspective projection and conservative homogeneous AABB culling. */
export function perspective(fov,aspect,near,far,zeroToOne=false){
  if(![fov,aspect,near,far].every(Number.isFinite)||fov<=0||fov>=Math.PI||aspect<=0||near<=0||far<=near)throw new RangeError('Invalid perspective frustum');
  const f=1/Math.tan(fov/2),m=new Float64Array(16);m[0]=f/aspect;m[5]=f;m[10]=(zeroToOne?far:far+near)/(near-far);m[11]=-1;m[14]=(zeroToOne?near*far:2*near*far)/(near-far);return m;
}
export function intersectsFrustum(box,matrix,zeroToOne=false){
  const outside=[true,true,true,true,true,true];
  for(let i=0;i<8;i++){
    const p=[i&1?box.max[0]:box.min[0],i&2?box.max[1]:box.min[1],i&4?box.max[2]:box.min[2]],v=[0,1,2,3].map(r=>matrix[r]*p[0]+matrix[4+r]*p[1]+matrix[8+r]*p[2]+matrix[12+r]);
    const [x,y,z,w]=v,dist=[x+w,w-x,y+w,w-y,zeroToOne?z:z+w,w-z];for(let j=0;j<6;j++)if(dist[j]>=-1e-8)outside[j]=false;
  }
  return !outside.some(Boolean);
}
export function cameraState(camera){return {target:[...camera.target],scale:camera.scale,yaw:camera.yaw,pitch:camera.pitch,projection:camera.projection||'orthographic',fov:camera.fov??45};}
export function restoreCamera(camera,state){
  if(!state||!Array.isArray(state.target)||state.target.length!==3||!state.target.every(Number.isFinite)||![state.scale,state.yaw,state.pitch,state.fov??45].every(Number.isFinite)||state.scale<.001||state.scale>1e7||Math.abs(state.pitch)>Math.PI/2||(state.fov??45)<10||(state.fov??45)>100||!['orthographic','perspective'].includes(state.projection||'orthographic'))throw new TypeError('Invalid saved camera');
  Object.assign(camera,{target:[...state.target],scale:state.scale,yaw:state.yaw,pitch:state.pitch,fov:state.fov??45,projection:state.projection||'orthographic'});return camera;
}
