"""Read-only reference measurements; never exports samples or note sequences.
Usage: python reference.py decoded-mono.wav > report.json
Requires numpy scipy librosa. Decode privately with ffmpeg at 22050 Hz.
"""
import sys,json
import numpy as np
import librosa
from scipy.signal import find_peaks
y,sr=librosa.load(sys.argv[1],sr=22050)
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
major=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
minor=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
reports=[]
for start,end in [(0,30),(30,60),(60,90),(90,120),(120,150),(150,180),(180,203)]:
 x=y[int(start*sr):int(end*sr)]
 h,p=librosa.effects.hpss(x)
 tuning=float(librosa.estimate_tuning(y=h,sr=sr))
 c=librosa.feature.chroma_cqt(y=h,sr=sr,tuning=tuning).mean(axis=1)
 scores=sorted([(float(np.corrcoef(c,np.roll(profile,k))[0,1]),names[k]+' '+mode) for mode,profile in [('major',major),('minor',minor)] for k in range(12)],reverse=True)
 spec=np.abs(librosa.stft(x,n_fft=16384,hop_length=2048))**2
 hz=librosa.fft_frequencies(sr=sr,n_fft=16384)
 power=spec.mean(axis=1)
 peaks,_=find_peaks(power)
 low=sorted([(float(power[i]),float(hz[i])) for i in peaks if 30<hz[i]<180],reverse=True)[:6]
 onset=librosa.onset.onset_strength(y=p,sr=sr,hop_length=128)
 # autocorrelation refinement, 110–140 BPM range
 ac=librosa.autocorrelate(onset,max_size=110)
 lags=np.arange(int(sr/128*60/140),int(sr/128*60/110)+1)
 lag=int(lags[np.argmax(ac[lags])]); delta=.5*(ac[lag-1]-ac[lag+1])/(ac[lag-1]-2*ac[lag]+ac[lag+1])
 reports.append(dict(seconds=[start,end],tuning_cents=round(tuning*100,2),key_scores=scores[:4],chroma=dict(zip(names,np.round(c/c.max(),3).tolist())),bass_peaks_hz=[round(f,2) for _,f in low],bpm=round(float(60*sr/128/(lag+delta)),2),energy_bands={label:round(float(power[(hz>=a)&(hz<b)].sum()/power.sum()),4) for label,a,b in [('field',30,180),('structure',180,2000),('signal',2000,11025)]}))
print(json.dumps(dict(duration=len(y)/sr,method='HPSS harmonic CQT + key-profile correlation; power peaks; percussive onset autocorrelation. Key scores are evidence, not certainty.',sections=reports),indent=2,default=float))
