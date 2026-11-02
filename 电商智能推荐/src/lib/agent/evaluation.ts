import { understand, type IntentName, type IntentSlots } from "@/lib/engine/intent";
import { retrieveKnowledge } from "@/lib/engine/knowledge";

export type IntentEvalCase = {
  message: string;
  intent: IntentName;
  slots?: Partial<
    Pick<
      IntentSlots,
      | "categories"
      | "colors"
      | "occasions"
      | "sizes"
      | "budget"
      | "orderNo"
      | "productRefs"
    >
  >;
};

export type IntentEvalFailure = {
  message: string;
  field: string;
  expected: unknown;
  actual: unknown;
};

export type IntentEvalReport = {
  total: number;
  passed: number;
  accuracy: number;
  slotChecks: number;
  slotPassed: number;
  slotAccuracy: number;
  byIntent: Record<string, { total: number; passed: number }>;
  failures: IntentEvalFailure[];
};

const includesAll = (actual: string[], expected: string[]): boolean =>
  expected.every((value) => actual.includes(value));

export function evaluateIntentCases(cases: IntentEvalCase[]): IntentEvalReport {
  const report: IntentEvalReport = {
    total: cases.length,
    passed: 0,
    accuracy: 0,
    slotChecks: 0,
    slotPassed: 0,
    slotAccuracy: 1,
    byIntent: {},
    failures: [],
  };

  for (const entry of cases) {
    const actual = understand(entry.message);
    const bucket = (report.byIntent[entry.intent] ??= { total: 0, passed: 0 });
    bucket.total += 1;

    let casePassed = actual.intent === entry.intent;
    if (!casePassed) {
      report.failures.push({
        message: entry.message,
        field: "intent",
        expected: entry.intent,
        actual: actual.intent,
      });
    }

    const expected = entry.slots;
    if (expected) {
      const check = (field: string, pass: boolean, expectedValue: unknown, actualValue: unknown) => {
        report.slotChecks += 1;
        if (pass) {
          report.slotPassed += 1;
        } else {
          casePassed = false;
          report.failures.push({
            message: entry.message,
            field,
            expected: expectedValue,
            actual: actualValue,
          });
        }
      };
      if (expected.budget !== undefined) {
        check(
          "budget",
          JSON.stringify(actual.slots.budget) === JSON.stringify(expected.budget),
          expected.budget,
          actual.slots.budget,
        );
      }
      if (expected.categories) {
        check(
          "categories",
          includesAll(actual.slots.categories, expected.categories),
          expected.categories,
          actual.slots.categories,
        );
      }
      if (expected.colors) {
        check(
          "colors",
          includesAll(actual.slots.colors, expected.colors),
          expected.colors,
          actual.slots.colors,
        );
      }
      if (expected.occasions) {
        check(
          "occasions",
          includesAll(actual.slots.occasions, expected.occasions),
          expected.occasions,
          actual.slots.occasions,
        );
      }
      if (expected.sizes) {
        check(
          "sizes",
          includesAll(actual.slots.sizes, expected.sizes),
          expected.sizes,
          actual.slots.sizes,
        );
      }
      if (expected.orderNo) {
        check(
          "orderNo",
          actual.slots.orderNo === expected.orderNo,
          expected.orderNo,
          actual.slots.orderNo,
        );
      }
      if (expected.productRefs) {
        check(
          "productRefs",
          includesAll(actual.slots.productRefs, expected.productRefs),
          expected.productRefs,
          actual.slots.productRefs,
        );
      }
    }

    if (casePassed) {
      report.passed += 1;
      bucket.passed += 1;
    }
  }

  report.accuracy = report.total ? report.passed / report.total : 0;
  report.slotAccuracy = report.slotChecks
    ? report.slotPassed / report.slotChecks
    : 1;
  return report;
}

export type RetrievalEvalCase = { query: string; expectedId: string };

export type RetrievalEvalReport = {
  total: number;
  top1: number;
  top3: number;
  mrr: number;
  misses: Array<{ query: string; expectedId: string; actual: string[] }>;
};

export function evaluateRetrieval(cases: RetrievalEvalCase[]): RetrievalEvalReport {
  let top1 = 0;
  let top3 = 0;
  let reciprocalRank = 0;
  const misses: RetrievalEvalReport["misses"] = [];

  for (const entry of cases) {
    const docs = retrieveKnowledge(entry.query, {
      topK: 3,
      types: ["policy", "size", "brand"],
    });
    const rank = docs.findIndex((doc) => doc.id === entry.expectedId);
    if (rank === 0) top1 += 1;
    if (rank >= 0 && rank < 3) top3 += 1;
    if (rank >= 0) reciprocalRank += 1 / (rank + 1);
    else {
      misses.push({
        query: entry.query,
        expectedId: entry.expectedId,
        actual: docs.map((doc) => doc.id),
      });
    }
  }

  return {
    total: cases.length,
    top1,
    top3,
    mrr: cases.length ? reciprocalRank / cases.length : 0,
    misses,
  };
}
