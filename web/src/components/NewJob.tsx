import { useEffect, useRef, useState } from 'react';
import { api, type Deliverable } from '../api';
import { MAX_IMAGES, prepareImage, type PreparedImage } from '../images';
import { Icon, useToast } from '../ui';

// Browser speech recognition (Chrome, Edge, Safari). No server involved.
const SpeechRec: any = typeof window === 'undefined' ? undefined : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in the browser address bar to dictate.',
  'service-not-allowed': 'Microphone access is blocked. Allow it in the browser address bar to dictate.',
  network: 'Speech recognition needs an internet connection in this browser.',
  'audio-capture': 'No microphone was found.',
};

export function NewJob({ onCreated }: { onCreated: (id: string) => void }) {
  const [request, setRequest] = useState('');
  const [amount, setAmount] = useState('');
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [deliverable, setDeliverable] = useState<Deliverable>('auto');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [dragging, setDragging] = useState(false);
  const rec = useRef<any>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => () => rec.current?.abort?.(), []);

  // ---------- voice ----------
  function toggleMic() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new SpeechRec();
    r.lang = navigator.language || 'en-US';
    r.continuous = true;
    r.interimResults = true;
    const base = request.trim() ? `${request.trim()} ` : '';
    r.onresult = (e: any) => {
      let finals = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals += res[0].transcript;
        else interim += res[0].transcript;
      }
      setRequest((base + finals + interim).slice(0, 2000));
    };
    r.onerror = (e: any) => {
      if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') toast(SPEECH_ERRORS[e.error] ?? `Voice input stopped (${e.error}).`, true);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  // ---------- images ----------
  async function addFiles(files: File[]) {
    const pics = files.filter((f) => f.type.startsWith('image/'));
    if (!pics.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return toast(`You can attach up to ${MAX_IMAGES} images.`, true);
    if (pics.length > room) toast(`Only ${room} more image${room === 1 ? '' : 's'} can be added.`, true);
    for (const f of pics.slice(0, room)) {
      try {
        const p = await prepareImage(f);
        setImages((cur) => (cur.length < MAX_IMAGES ? [...cur, p] : cur));
      } catch (e) {
        toast((e as Error).message, true);
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      rec.current?.stop?.();
      const { job } = await api.createJob(request, amount, images.map(({ name, type, data }) => ({ name, type, data })), deliverable);
      toast(job.status === 'pending_approval' ? 'Contract ready. Policy needs your approval to spend.' : 'Contract written. Fund it to hold the money.');
      onCreated(job.id);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  const dropProps = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); },
  };

  return (
    <form id="new-job" className="card shadow postjob" onSubmit={submit} aria-label="Post a job">
      <header>
        <h2>Post a job</h2>
        <span className="faint">AI writes the contract</span>
      </header>

      <div className="fgroup">
        <label htmlFor="job-request">What do you need done?</label>
        <div className={`composer${listening ? ' live' : ''}`}>
          <textarea
            id="job-request"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onPaste={(e) => { const files = [...e.clipboardData.files]; if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); addFiles(files); } }}
            placeholder="Describe the work in plain English. The AI will write the acceptance tests."
            required
            minLength={10}
            maxLength={2000}
            name="request"
          />
          <div className="composer-bar">
            <button
              type="button"
              className={`tool${listening ? ' on' : ''}`}
              onClick={toggleMic}
              disabled={!SpeechRec}
              aria-pressed={listening}
              aria-label={listening ? 'Stop dictation' : 'Dictate the description'}
              title={SpeechRec ? (listening ? 'Stop dictation' : 'Dictate with your voice') : 'Voice input works in Chrome, Edge and Safari'}
            >
              <Icon name="mic" /><span>{listening ? 'Listening…' : 'Dictate'}</span>
            </button>
            <div className="deliv" role="group" aria-label="What the worker will hand in">
              <span className="faint">Deliverable</span>
              {([['auto', 'Auto'], ['text', 'Text / code'], ['image', 'Image']] as [Deliverable, string][]).map(([k, label]) => (
                <button key={k} type="button" className="filter" aria-pressed={deliverable === k} onClick={() => setDeliverable(k)}>{label}</button>
              ))}
            </div>
            <span className="faint count">{request.length}/2000</span>
          </div>
        </div>
      </div>

      <div className="fgroup">
        <span className="lbl" id="img-label">Reference images <em>optional</em></span>
        <div className={`dropzone${dragging ? ' drag' : ''}`} role="group" aria-labelledby="img-label" {...dropProps}>
          {images.length === 0 ? (
            <div className="dz-empty">
              <span className="dz-ico"><Icon name="image" /></span>
              <div><b>Add screenshots or mockups</b><span>Drag and drop, paste, or browse. Up to {MAX_IMAGES}.</span></div>
              <button type="button" className="tool" onClick={() => fileInput.current?.click()} aria-label="Attach images">Browse</button>
            </div>
          ) : (
            <div className="dz-list">
              <ul className="thumbs" aria-label="Attached images">
                {images.map((im, i) => (
                  <li key={i}>
                    <img src={im.preview} alt={im.name} />
                    <button type="button" aria-label={`Remove ${im.name}`} onClick={() => setImages((cur) => cur.filter((_, k) => k !== i))}><Icon name="x" /></button>
                  </li>
                ))}
              </ul>
              <button type="button" className="tool" onClick={() => fileInput.current?.click()} disabled={images.length >= MAX_IMAGES} aria-label="Attach images">
                <Icon name="plus" /><span>{images.length >= MAX_IMAGES ? 'Limit reached' : 'Add more'}</span>
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          aria-label="Choose images"
          onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }}
        />
      </div>

      <div className="actions">
        <label className="fgroup">
          <span className="lbl">Budget (USD)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 50.00" pattern="\d+(\.\d{1,2})?" required name="amount" />
        </label>
        <button className="btn primary lg" disabled={busy}>
          {busy ? 'AI is writing the contract…' : <>Create contract<Icon name="arrow" /></>}
        </button>
        <p className="faint note">Held by PayPal. You are only charged when the work is verified.</p>
      </div>
    </form>
  );
}
