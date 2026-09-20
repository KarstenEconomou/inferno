"""Aggregate mixed-program envelope/stereo statistics, not isolated instrument analysis.
Usage: python envelopes.py reference.webm > report.json
No audio samples are written. Requires ffmpeg on PATH.
"""
import sys,subprocess,json
import numpy as np
from scipy.signal import butter,sosfilt,find_peaks,hilbert
sr=48000
raw=subprocess.check_output(['ffmpeg','-v','error','-i',sys.argv[1],'-vn','-ac','2','-ar',str(sr),'-f','f32le','pipe:1'])
y=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
x=y[35*sr:55*sr]
report={}
for label,lo,hi in [('field',30,180),('structure',180,2000),('signal',2000,12000)]:
 band=sosfilt(butter(3,[lo,hi],fs=sr,btype='bandpass',output='sos'),x,axis=0)
 mid=(band[:,0]+band[:,1])/2; side=(band[:,0]-band[:,1])/2
 envelope=np.abs(hilbert(mid))
 env=np.convolve(envelope,np.ones(384)/384,mode="same")[::48]
 peaks,_=find_peaks(env,distance=100,prominence=np.max(env)*.15)
 attacks=[];decays=[]
 for p in peaks:
  if p<60 or p+230>=len(env):continue
  before=env[p-60:p];after=env[p:p+230]
  ten=np.where(before<env[p]*.1)[0];ninety=np.where(before<env[p]*.9)[0]
  if len(ten) and len(ninety):attacks.append(int(ninety[-1]-ten[-1]))
  tail=np.where(after<env[p]*.2)[0]
  if len(tail):decays.append(int(tail[0]))
 report[label]=dict(side_to_mid_db=round(float(10*np.log10(np.mean(side**2)/np.mean(mid**2)+1e-15)),2),transients=len(peaks),median_10_90_attack_ms=float(np.median(attacks)) if attacks else None,median_peak_to_20_percent_ms=float(np.median(decays)) if decays else None)
print(json.dumps(dict(seconds=[35,55],caveat='Mixed program, overlapping instruments; descriptive aggregate only, not sample reconstruction.',bands=report),indent=2))
