import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DatasetSummary, type Health, type LedgerView, type PackId, type PackInfo, type ProviderInfo, type RulebookRecord, type RunRecord } from "../api";

export const packOf = (rb: { pack?: PackId } | undefined | null): PackId => rb?.pack ?? "rent-collection";

export type StepId = "tell" | "rules" | "test" | "approve" | "run" | "proof";
export type StepState = "done" | "now" | "busy" | "problem" | "later";

/** Everything the owner-facing studio needs: the same pipeline as the developer studio, one hook. */
export function useStudio() {
  const [health, setHealth] = useState<Health | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [pack, setPack] = useState<PackId>("rent-collection");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("");
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetId, setDatasetId] = useState<string>("");
  const [sop, setSop] = useState("");
  const sample = useRef("");
  const [record, setRecord] = useState<RulebookRecord | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [h, l] = await Promise.all([api.health(), api.ledger()]);
    setHealth(h);
    setLedger(l);
  }, []);

  const loadSample = useCallback(async (p: PackId) => {
    const { sop: text } = await api.defaultSop(p);
    const previous = sample.current;
    sample.current = text;
    setSop((current) => (current.trim() === "" || current === previous ? text : current));
  }, []);

  const loadDatasets = useCallback(async () => setDatasets(await api.datasets()), []);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
        const [p, pr, list] = await Promise.all([api.packs(), api.providers(), api.rulebooks()]);
        setPacks(p);
        setProviders(pr.providers);
        setProvider(pr.default);
        void loadDatasets();
        const latest = list[0];
        if (latest) {
          const rb = await api.rulebook(latest.id);
          setRecord(rb);
          setPack(packOf(rb.rulebook));
          setSop(rb.sop);
          sample.current = "";
          if (rb.datasetId) setDatasetId(rb.datasetId);
          if (rb.lastRunId) setRun(await api.run(rb.lastRunId));
        } else await loadSample("rent-collection");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoaded(true);
      }
    })();
  }, [refresh, loadSample, loadDatasets]);

  // Follow a test run until it finishes.
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const t = setInterval(async () => {
      const next = await api.run(run.id);
      setRun(next);
      if (next.status === "done" || next.status === "error") {
        setRecord(await api.rulebook(next.rulebookId));
        void refresh();
      }
    }, 700);
    return () => clearInterval(t);
  }, [run, refresh]);

  /** Runs one action; resolves true when it succeeded (the error is shown otherwise). */
  const guard = async (label: string, fn: () => Promise<void>): Promise<boolean> => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const choosePack = (p: PackId) => {
    setPack(p);
    setDatasetId(p === "generic" ? "sample" : "");
    void loadSample(p);
  };

  const compile = (text = sop) =>
    guard("compile", async () => {
      const ds = pack === "generic" ? datasetId || "sample" : pack === "rent-collection" && datasetId ? datasetId : undefined;
      const rb = await api.compile(text, pack, provider, ds);
      setSop(text);
      setRecord(rb);
      setRun(null);
    });

  /** A change in plain words (an answer to a question, a new rule) becomes a revision of the current rules. */
  const revise = (text: string) =>
    guard("revise", async () => {
      if (!record) return;
      const rb = await api.revise(record.id, { text, provider });
      setSop(text);
      setRecord(rb);
      setRun(null);
    });

  const test = () =>
    guard("test", async () => {
      if (!record) return;
      setRun(await api.startRun(record.id, false));
    });

  const registerPasskey = () =>
    guard("passkey", async () => {
      const optionsJSON = await api.registerOptions();
      const response = await startRegistration({ optionsJSON: optionsJSON as never });
      await api.registerVerify(response);
      await refresh();
    });

  const approve = () =>
    guard("approve", async () => {
      if (!record) return;
      const { options } = await api.approveOptions(record.id);
      const response = await startAuthentication({ optionsJSON: options as never });
      setRecord(await api.approveVerify(record.id, response));
      await refresh();
    });

  const uploadCsv = (file: File) =>
    guard("upload", async () => {
      const d = await api.uploadDataset(file.name.replace(/\.csv$/i, ""), await file.text());
      await loadDatasets();
      setDatasetId(d.id);
    });

  // Where the owner stands, step by step.
  const testing = run?.status === "queued" || run?.status === "running";
  const passed = run?.status === "done" && run.verdict?.status === "pass" && run.rulebookId === record?.id;
  const failed = run?.rulebookId === record?.id && (run?.status === "error" || (run?.status === "done" && run.verdict?.status === "fail"));
  const approved = record?.status === "approved";
  const runnable = record ? ["rent-collection", "generic"].includes(packOf(record.rulebook)) : true;
  const state: Record<StepId, StepState> = {
    tell: record ? "done" : "now",
    rules: !record ? "later" : record.issues.length ? "problem" : "done",
    test: !record ? "later" : testing ? "busy" : passed ? "done" : failed ? "problem" : "now",
    approve: approved ? "done" : passed ? "now" : "later",
    run: !runnable ? "later" : approved ? "now" : "later",
    proof: ledger && ledger.entries.length ? "done" : "later",
  };
  const order: StepId[] = ["tell", "rules", "test", "approve", "run", "proof"];
  const current = order.find((s) => state[s] === "now" || state[s] === "problem" || state[s] === "busy") ?? (approved ? "run" : "tell");
  const doneCount = order.filter((s) => state[s] === "done").length;

  return {
    health,
    packs,
    pack,
    choosePack,
    providers,
    provider,
    setProvider,
    datasets,
    datasetId,
    setDatasetId,
    uploadCsv,
    sop,
    setSop,
    record,
    run,
    ledger,
    busy,
    error,
    setError,
    loaded,
    compile,
    revise,
    test,
    registerPasskey,
    approve,
    refresh,
    state,
    order,
    current,
    doneCount,
    passed,
    failed,
    testing,
    approved,
    runnable,
  };
}

export type Studio = ReturnType<typeof useStudio>;
