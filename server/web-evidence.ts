import type { GroundingMetadata } from '@google/genai';

type ModelSource = { kind?: string; excerpt?: string; webUrl?: string };
type ModelProposal = { fieldId?: string; values?: string[]; source?: ModelSource };
type ModelAnalysis = { proposals?: ModelProposal[]; warnings?: string[] };

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function citedRetailerUrl(proposal: ModelProposal, metadata?: GroundingMetadata) {
  const url = proposal.source?.webUrl;
  if (typeof url !== 'string' || !/^https:\/\/[^\s]+$/i.test(url)) return null;
  const chunks = metadata?.groundingChunks || [];
  const exact = chunks.find((chunk) => chunk.web?.uri === url)?.web?.uri;
  if (exact) return exact;

  // Google can return a grounding redirect instead of the direct page URL.
  const requestedHost = hostname(url);
  const sameSite = chunks.find((chunk) => {
    const web = chunk.web;
    if (!web?.uri || !requestedHost) return false;
    const citedHost = web.domain || web.title || '';
    return (
      hostname(`https://${citedHost}`) === requestedHost ||
      citedHost.toLowerCase().replace(/^www\./, '') === requestedHost
    );
  })?.web?.uri;
  if (sameSite) return sameSite;

  const retailer = proposal.values?.[0]?.trim().toLowerCase();
  if (!retailer) return null;
  for (const support of metadata?.groundingSupports || []) {
    if (!support.segment?.text?.toLowerCase().includes(retailer)) continue;
    for (const index of support.groundingChunkIndices || []) {
      const cited = chunks[index]?.web?.uri;
      if (cited) return cited;
    }
  }
  return null;
}

function hasDirectRetailerEvidence(proposal: ModelProposal) {
  const value = proposal.values?.[0]?.trim().toLowerCase();
  const source = proposal.source;
  return (
    Boolean(value && source?.excerpt?.toLowerCase().includes(value)) &&
    (source?.kind === 'document' || source?.kind === 'note')
  );
}

export function validateRetailerWebEvidence(input: unknown, metadata?: GroundingMetadata) {
  if (!input || typeof input !== 'object') return input;
  const analysis = input as ModelAnalysis;
  if (!Array.isArray(analysis.proposals)) return input;
  let needsWarning = false;
  const proposals = analysis.proposals.flatMap((proposal) => {
    const source = proposal.source;
    if (!source || source.webUrl === undefined) return [proposal];
    if (!source.webUrl || proposal.fieldId !== 'mediaPlacementRetailer') {
      const nextSource = { ...source };
      delete nextSource.webUrl;
      return [{ ...proposal, source: nextSource }];
    }

    const citedUrl = citedRetailerUrl(proposal, metadata);
    if (citedUrl) return [{ ...proposal, source: { ...source, webUrl: citedUrl } }];
    if (hasDirectRetailerEvidence(proposal)) {
      const nextSource = { ...source };
      delete nextSource.webUrl;
      return [{ ...proposal, source: nextSource }];
    }
    needsWarning = true;
    return [];
  });
  if (
    !needsWarning &&
    proposals.every((proposal, index) => proposal === analysis.proposals![index])
  )
    return input;
  return {
    ...analysis,
    proposals,
    warnings: needsWarning
      ? [
          ...(Array.isArray(analysis.warnings) ? analysis.warnings.slice(0, 19) : []),
          'The retailer abbreviation could not be verified. Please confirm which retailer is intended.',
        ]
      : analysis.warnings,
  };
}
