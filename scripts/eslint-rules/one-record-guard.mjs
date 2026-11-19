/**
 * `tear/one-record-guard`: a `typeof x` compared with "object" belongs in src/domain/records.ts only. Every
 * other file asks records.ts: `isRecord` (a plain JSON object), `asRecord` (the record or undefined),
 * `requireRecord` (the record, or a TypeError with the caller's message) or `isObject` (any non-null object).
 *
 * Every spelling is caught, so the rule cannot be dodged: `===`, `==`, `!==`, `!=`, either operand order, the
 * text as a string or a template literal, and `switch (typeof x) { case "object": }`.
 */
const OWNER = "/src/domain/records.ts";
const EQUALITY = new Set(["===", "==", "!==", "!="]);

const isTypeof = (node) => node?.type === "UnaryExpression" && node.operator === "typeof";
const isObjectText = (node) =>
  (node?.type === "Literal" && node.value === "object") ||
  (node?.type === "TemplateLiteral" && node.expressions.length === 0 && node.quasis[0]?.value.cooked === "object");

export const oneRecordGuard = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      useRecords:
        'Ask src/domain/records.ts (isRecord, asRecord, requireRecord or isObject) instead of comparing typeof with "object".',
    },
  },
  create(context) {
    if (context.filename.replaceAll("\\", "/").endsWith(OWNER)) return {};
    return {
      BinaryExpression(node) {
        if (!EQUALITY.has(node.operator)) return;
        if ((isTypeof(node.left) && isObjectText(node.right)) || (isTypeof(node.right) && isObjectText(node.left)))
          context.report({ node, messageId: "useRecords" });
      },
      SwitchCase(node) {
        if (isTypeof(node.parent.discriminant) && isObjectText(node.test))
          context.report({ node, messageId: "useRecords" });
      },
    };
  },
};
