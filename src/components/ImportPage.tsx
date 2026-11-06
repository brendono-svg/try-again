import { useState, type DragEvent } from 'react';
import { useAppState } from '../state';
import { parseFile } from '../lib/parsers';
import { importStatement, accountLabel, accountIdFor, withRecategorise } from '../lib/store';
import { formatDate } from '../lib/dates';
import type { AppState, ImportRecord } from '../types';

interface Result {
  fileName: string;
  record?: ImportRecord;
  account?: string;
  error?: string;
}

export default function ImportPage({ onDone }: { onDone: () => void }) {
  const { update, getState } = useAppState();
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function handleFiles(files: FileList | File[]) {
    setBusy(true);
    const list = Array.from(files);
    const out: Result[] = [];
    const { loadPdfPages } = await import('../lib/pdfBrowser');
    // Apply files one after another so de-duplication sees the earlier ones.
    let working: AppState = getState();
    for (const file of list) {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const statements = await parseFile(file.name, data, loadPdfPages);
        for (const st of statements) {
          const res = importStatement(working, st, file.name);
          working = res.state;
          out.push({ fileName: file.name, record: res.record, account: accountLabel(working.accounts[accountIdFor(st)]) });
        }
      } catch (e) {
        out.push({ fileName: file.name, error: e instanceof Error ? e.message : String(e) });
      }
      setResults([...out]);
    }
    const finalState = working;
    update(() => withRecategorise(finalState));
    setBusy(false);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Import statements</h2>
        <label
          className={drag ? 'drop on' : 'drop'}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input type="file" multiple accept=".pdf,.csv,.ofx,.qfx,.txt" onChange={(e) => e.target.files && handleFiles(e.target.files)} disabled={busy} />
          <strong>{busy ? 'Reading statements…' : 'Drop statement files here or click to choose'}</strong>
          <span className="muted">PDF statements, CSV or OFX/QFX exports. You can select many at once, and overlapping statements are de-duplicated.</span>
        </label>

        {results.length > 0 && (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Account</th>
                  <th>Period</th>
                  <th className="num">Added</th>
                  <th className="num">Already had</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td className="small">{r.fileName}</td>
                    {r.error ? (
                      <td colSpan={5} className="error">
                        {r.error}
                      </td>
                    ) : (
                      <>
                        <td>{r.account}</td>
                        <td className="small nowrap">
                          {r.record?.periodStart ? formatDate(r.record.periodStart) : '?'} – {r.record?.periodEnd ? formatDate(r.record.periodEnd) : '?'}
                        </td>
                        <td className="num">{r.record?.added}</td>
                        <td className="num">{r.record?.duplicates}</td>
                        <td className="small">
                          {r.record?.reconciled === true ? (
                            <span className="ok">✓ Balances match</span>
                          ) : r.record?.reconciled === false ? (
                            <span className="warn">! {r.record.warnings[0]}</span>
                          ) : (
                            <span className="muted">No balances to check</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!busy && (
              <div className="row">
                <button className="primary" onClick={onDone}>
                  See overview
                </button>
                <span className="muted small">Next: check who owns each account on the Accounts page.</span>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Getting your statements</h2>
        <div className="two-col">
          <div>
            <h3>Westpac (you)</h3>
            <ul className="tips">
              <li>Westpac One app or online: select the account → <em>Statements</em> → download the PDF for each month. Everyday, savings and credit card statements are all supported.</li>
              <li>Or: account → <em>Export transactions</em> → CSV or OFX for any date range. Handy for catching up on recent weeks before the next statement.</li>
            </ul>
          </div>
          <div>
            <h3>ASB (partner &amp; joint)</h3>
            <ul className="tips">
              <li>ASB internet banking: select the account → <em>Export</em> (or <em>Download transactions</em>) → choose <strong>CSV</strong> (or OFX) and a date range. This is the most reliable option.</li>
              <li>ASB statement PDFs also work for most layouts. If one won't read, use the CSV export instead.</li>
              <li>Repeat for each account, including the joint and any credit card.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
