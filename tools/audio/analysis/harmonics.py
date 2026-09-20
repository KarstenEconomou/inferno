"""Aggregate spectral peaks only; no samples or melodic transcription exported."""
import sys
import numpy as np,librosa,json
from scipy.signal import butter,sosfilt,find_peaks
import soundfile as sf
y,sr=sf.read(sys.argv[1])
reports=[]
for a,b in [(4,24),(92,110),(35,55),(155,175)]:
 x=y[int(a*sr):int(b*sr)]
 h=librosa.effects.harmonic(x)
 S=np.abs(librosa.stft(h,n_fft=32768,hop_length=4096))
 freq=librosa.fft_frequencies(sr=sr,n_fft=32768)
 avg=np.mean(S**2,axis=1); peaks,_=find_peaks(avg)
 selected=sorted([i for i in peaks if 45<freq[i]<1500],key=lambda i:avg[i],reverse=True)[:10]
 result=[]
 for i in selected:
  logs=np.log(avg[i-1:i+2]+1e-15); delta=.5*(logs[0]-logs[2])/(logs[0]-2*logs[1]+logs[2])
  hz=(i+delta)*sr/32768; midi=librosa.hz_to_midi(hz)
  result.append([round(hz,2),librosa.midi_to_note(round(midi)),round(100*(midi-round(midi)),1)])
 reports.append(dict(seconds=[a,b],harmonic_spectral_peaks=result))
print(json.dumps(reports,indent=2))
