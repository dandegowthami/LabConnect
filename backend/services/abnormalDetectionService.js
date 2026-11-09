import CriticalThresholdRule from '../models/CriticalThresholdRule.js';

function normalizedName(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en');
}

export async function classifyParameters(parameters) {
  const names = [...new Set(parameters.map(({ parameterName }) => parameterName).filter(Boolean))];
  const units = [...new Set(parameters.map(({ unit }) => unit).filter(Boolean))];
  const rules = names.length && units.length
    ? await CriticalThresholdRule.find({
      status: 'Approved',
      parameterName: { $in: names },
      unit: { $in: units }
    }).select('parameterName unit criticalLow criticalHigh').lean()
    : [];
  const rulesByParameter = new Map(
    rules.map((rule) => [`${normalizedName(rule.parameterName)}\u0000${rule.unit}`, rule])
  );

  return parameters.map((parameter) => {
    const result = Number(parameter.result);
    const minimum = Number(parameter.referenceMin);
    const maximum = Number(parameter.referenceMax);
    const hasResult = parameter.result !== null && parameter.result !== undefined
      && parameter.result !== '' && Number.isFinite(result);
    const hasReferenceRange = parameter.referenceMin !== null && parameter.referenceMin !== undefined
      && parameter.referenceMax !== null && parameter.referenceMax !== undefined
      && Number.isFinite(minimum) && Number.isFinite(maximum) && minimum <= maximum;
    const approvedRule = rulesByParameter.get(`${normalizedName(parameter.parameterName)}\u0000${parameter.unit}`);
    const belowCritical = approvedRule?.criticalLow !== null
      && approvedRule?.criticalLow !== undefined
      && hasResult
      && result <= approvedRule.criticalLow;
    const aboveCritical = approvedRule?.criticalHigh !== null
      && approvedRule?.criticalHigh !== undefined
      && hasResult
      && result >= approvedRule.criticalHigh;

    let classification = 'Reference range unavailable';
    if (belowCritical || aboveCritical) classification = 'Critical';
    else if (hasResult && hasReferenceRange) {
      if (result < minimum) classification = 'Below reference range';
      else if (result > maximum) classification = 'Above reference range';
      else classification = 'Normal';
    }

    return {
      parameterName: parameter.parameterName,
      result: parameter.result,
      unit: parameter.unit,
      referenceMin: parameter.referenceMin ?? null,
      referenceMax: parameter.referenceMax ?? null,
      classification,
      criticalRuleConfigured: Boolean(approvedRule),
      criticalRuleApproved: Boolean(approvedRule),
      criticalThresholdRuleId: approvedRule?._id ? String(approvedRule._id) : null
    };
  });
}
