// Reference solutions for every level: each must earn 3 stars. Run after editing levels or the model.
import { LEVELS, evaluateLevel } from "../lib/levels";
import { runTests } from "../lib/run";
import { simulate } from "../lib/simulate";

type N = { id: string; data: any };
const n = (id: string, c: string, units = 1, multiAz = false, hitRate = 0.8): N => ({ id, data: { catalogId: c, units, multiAz, hitRate } });
const chain = (...ids: string[]) => ids.slice(1).map((t, i) => ({ id: ids[i] + ">" + t, source: ids[i], target: t }));
const e = (s: string, t: string) => ({ id: s + ">" + t, source: s, target: t });

const solutions: Record<string, { nodes: N[]; edges: any[] }> = {
  "first-deploy": { nodes: [n("u", "users"), n("app", "aws-ec2", 2)], edges: chain("u", "app") },
  "share-the-load": { nodes: [n("u", "users"), n("lb", "aws-alb"), n("app", "aws-ec2", 4, true)], edges: chain("u", "lb", "app") },
  "remember-things": { nodes: [n("u", "users"), n("lb", "aws-alb"), n("app", "aws-ec2", 3, true), n("db", "aws-rds", 1, true)], edges: chain("u", "lb", "app", "db") },
  "read-heavy": { nodes: [n("u", "users"), n("cf", "aws-cloudfront"), n("lb", "aws-alb"), n("app", "aws-ec2", 4, true), n("r", "aws-elasticache", 1, true, 0.85), n("db", "aws-rds", 1, true)], edges: [...chain("u", "cf", "lb", "app"), e("app", "r"), e("app", "db")] },
  "the-edge": { nodes: [n("u", "users"), n("cf", "aws-cloudfront"), n("lb", "aws-alb"), n("app", "aws-ec2", 4, true), n("s3", "aws-s3")], edges: [...chain("u", "cf", "lb", "app"), e("app", "s3")] },
  "production-ready": { nodes: [n("u", "users"), n("cf", "aws-cloudfront"), n("lb", "aws-alb"), n("app", "aws-ec2", 6, true), n("r", "aws-elasticache", 2, true), n("db", "aws-rds", 2, true), n("cw", "aws-cloudwatch")], edges: [...chain("u", "cf", "lb", "app"), e("app", "r"), e("app", "db"), e("app", "cw")] },
  "flash-sale": { nodes: [n("u", "users"), n("cf", "aws-cloudfront"), n("lb", "aws-alb"), n("app", "aws-ec2", 44, true), n("q", "aws-sqs"), n("w", "aws-ecs", 4, true), n("db", "aws-rds", 2, true), n("r", "aws-elasticache", 2, true)], edges: [...chain("u", "cf", "lb", "app"), e("app", "q"), e("app", "db"), e("app", "r"), e("q", "w"), e("w", "db")] },
  "real-time-chat": { nodes: [n("u", "users"), n("ws", "aws-apigw-ws", 4), n("fn", "aws-lambda", 4), n("ddb", "aws-dynamodb")], edges: chain("u", "ws", "fn", "ddb") },
  "url-shortener": { nodes: [n("u", "users"), n("cf", "aws-cloudfront"), n("lb", "aws-alb"), n("app", "aws-ec2", 18, true), n("r", "aws-elasticache", 1, true, 0.9), n("ddb", "aws-dynamodb")], edges: [...chain("u", "cf", "lb", "app"), e("app", "r"), e("app", "ddb")] },
  "az-basic-web-app": { nodes: [n("u", "users"), n("app", "az-appservice", 2), n("db", "az-sql"), n("mon", "az-monitor")], edges: [...chain("u", "app", "db"), e("app", "mon")] },
  "az-zone-redundant": { nodes: [n("u", "users"), n("fd", "az-frontdoor"), n("gw", "az-appgw"), n("app", "az-appservice", 6, true), n("db", "az-sql", 1, true)], edges: chain("u", "fd", "gw", "app", "db") },
  "az-static-content": { nodes: [n("u", "users"), n("fd", "az-frontdoor"), n("blob", "az-blob"), n("app", "az-appservice", 2, true), n("db", "az-sql", 1, true)], edges: [...chain("u", "fd", "app", "db"), e("fd", "blob")] },
  "az-protect-apis": { nodes: [n("u", "users"), n("gw", "az-appgw"), n("apim", "az-apim", 3), n("aks", "az-aks", 36, true), n("db", "az-cosmos")], edges: chain("u", "gw", "apim", "aks", "db") },
  "az-load-leveling": { nodes: [n("u", "users"), n("app", "az-appservice", 24, true), n("sb", "az-servicebus"), n("fn", "az-functions"), n("db", "az-sql", 1, true)], edges: [...chain("u", "app", "sb", "fn", "db"), e("app", "db")] },
  "az-polyglot": { nodes: [n("u", "users"), n("apim", "az-apim", 3), n("app", "az-appservice", 24, true), n("cosmos", "az-cosmos"), n("sql", "az-sql", 2, true)], edges: [...chain("u", "apim", "app", "cosmos"), e("app", "sql")] },
};

for (const level of LEVELS) {
  const s = solutions[level.id];
  const users = level.scenario.dailyActiveUsers;
  const baseline = simulate(s.nodes, s.edges, level.scenario, users);
  const report = runTests(s.nodes, s.edges, level.scenario, users);
  const r = evaluateLevel(level, { nodes: s.nodes, edges: s.edges, baseline, report });
  const fails = r.objectives.filter((o) => !o.passed).map((o) => o.label);
  if (r.stars < 3) process.exitCode = 1;
  console.log(`${"★".repeat(r.stars).padEnd(3, "·")} ${level.id.padEnd(18)} cost=$${Math.round(baseline.monthlyCost)} supports=${Math.round(baseline.supportedUsers / 1e3)}k/${users / 1e3}k ${fails.length ? "FAIL: " + fails.join("; ") : ""}`);
}
