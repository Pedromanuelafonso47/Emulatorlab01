import { buildNetlist, type Netlist } from '@/engine/netlist';
import { runERC, type Issue } from '@/engine/erc';
import type { CircuitDocument } from '@/domain/types';
import { useEditor } from './editor';

/** Netlist + ERC are pure functions of the document; cache by document identity so all consumers share one computation. */
let cache: { doc: CircuitDocument; nl: Netlist; issues: Issue[] } | null = null;

export function analyze(doc: CircuitDocument) {
  if (cache?.doc === doc) return cache;
  const nl = buildNetlist(doc);
  const issues = runERC(doc, nl);
  cache = { doc, nl, issues };
  return cache;
}

export function useAnalysis() {
  const doc = useEditor((s) => s.doc);
  return analyze(doc);
}
