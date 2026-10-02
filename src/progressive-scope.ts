import { fields, validValue, type Analysis, type Attachment, type Proposal, type Values } from '../shared/brief-contract.ts';

export type ScopePhase = 'general-information' | 'route-selection' | 'route-details';

/** Publish general information immediately, then work against the latest user edits. */
export async function runProgressiveScope(
  documents: Attachment[],
  dependencies: {
    analyze: (phase: ScopePhase, provisionalValues: Values) => Promise<Analysis>;
    proposals: () => Proposal[];
    revision: () => number;
    publish: (phase: ScopePhase, analysis: Analysis) => void;
    onStage: (phase: ScopePhase) => void;
  },
  resume = false,
) {
  if (!resume) {
    dependencies.onStage('general-information');
    dependencies.publish('general-information', await dependencies.analyze('general-information', {}));
  }
  const routeField = fields.find((field) => field.id === 'requestTypes')!;
  const snapshot = () => Object.fromEntries(dependencies.proposals().map((proposal) => [proposal.fieldId, proposal.values]));
  for (;;) {
    let provisional = snapshot();
    if (!validValue(routeField, provisional.requestTypes, documents)) {
      dependencies.onStage('route-selection');
      const revision = dependencies.revision();
      let route: Analysis;
      try {
        route = await dependencies.analyze('route-selection', provisional);
      } catch (error) {
        if (revision !== dependencies.revision()) continue;
        throw error;
      }
      if (revision !== dependencies.revision()) continue;
      if (route.questions.some((question) => question.fieldId === 'requestTypes')) {
        dependencies.publish('route-selection', {
          ...route,
          proposals: route.proposals.filter((proposal) => proposal.fieldId !== 'requestTypes'),
        });
        return false;
      }
      dependencies.publish('route-selection', route);
      provisional = snapshot();
      if (!validValue(routeField, provisional.requestTypes, documents)) return false;
    }
    dependencies.onStage('route-details');
    const revision = dependencies.revision();
    let details: Analysis;
    try {
      details = await dependencies.analyze('route-details', provisional);
    } catch (error) {
      if (revision !== dependencies.revision()) continue;
      throw error;
    }
    if (revision !== dependencies.revision()) continue;
    dependencies.publish('route-details', details);
    return true;
  }
}
