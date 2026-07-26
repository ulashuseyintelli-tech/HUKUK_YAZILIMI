import { MAX_SCENARIOS } from '../scenario-ranker.dto';
import { ScenarioRankerService } from '../scenario-ranker.service';

describe('ScenarioRankerService input bound', () => {
  it('rejects an oversized scenario set before ranking', () => {
    const service = new ScenarioRankerService();
    const scenarios = Array.from({ length: MAX_SCENARIOS + 1 }, (_, index) => ({
      scenarioId: `scenario-${index}`,
      riskScore: index,
      costScore: index,
    }));

    expect(() => service.rank(scenarios, 0)).toThrow(
      `scenarios must contain at most ${MAX_SCENARIOS} items`,
    );
  });
});
