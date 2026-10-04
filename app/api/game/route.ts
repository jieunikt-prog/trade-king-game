import { compareAndSetJson, getJson, publicStorageError, setJsonIfMissing } from "@/lib/upstash-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNTRIES = [
  { id: "kr", name: "대한민국", flag: "🇰🇷", money: 1400, r: { oil: 0, iron: 10, gold: 0, wood: 25, labor: 10 } },
  { id: "sa", name: "사우디아라비아", flag: "🇸🇦", money: 700, r: { oil: 100, iron: 0, gold: 5, wood: 0, labor: 10 } },
  { id: "au", name: "호주", flag: "🇦🇺", money: 500, r: { oil: 5, iron: 120, gold: 5, wood: 0, labor: 10 } },
  { id: "za", name: "남아프리카공화국", flag: "🇿🇦", money: 900, r: { oil: 5, iron: 0, gold: 85, wood: 0, labor: 10 } },
  { id: "ca", name: "캐나다", flag: "🇨🇦", money: 1300, r: { oil: 0, iron: 10, gold: 0, wood: 30, labor: 20 } },
  { id: "cn", name: "중국", flag: "🇨🇳", money: 500, r: { oil: 0, iron: 10, gold: 10, wood: 0, labor: 120 } },
];

const STEPS = [
  { name: "농업 사회", tech: "", cost: 0, req: {} },
  { name: "인쇄 공업", tech: "인쇄 기술", cost: 30, req: { wood: 6, labor: 6 } },
  { name: "섬유 공업", tech: "섬유 기술", cost: 40, req: { oil: 4, labor: 8 } },
  { name: "석유 화학", tech: "석유 화학 기술", cost: 50, req: { oil: 7, gold: 1, wood: 1, labor: 3 } },
  { name: "제철", tech: "제철 기술", cost: 60, req: { iron: 8, gold: 1, labor: 3 } },
  { name: "자동차", tech: "자동차 기술", cost: 80, req: { oil: 2, iron: 5, gold: 2, labor: 3 } },
  { name: "컴퓨터", tech: "컴퓨터 기술", cost: 100, req: { oil: 1, iron: 4, gold: 5, labor: 2 } },
  { name: "전기·전자 공업", tech: "반도체 기술", cost: 200, req: { oil: 1, iron: 3, gold: 6, labor: 2 } },
  { name: "첨단 산업", tech: "첨단·미래 기술", cost: 300, req: { oil: 3, iron: 5, gold: 2, wood: 2, labor: 3 } },
];

type Country = (typeof COUNTRIES)[number] & { stage: number; tech: boolean };
type GameState = {
  countries: Country[];
  status: "waiting" | "playing" | "finished";
  logs: { t: string; m: string }[];
};
type Trade = {
  id: string;
  sellerId: string;
  buyerId: string;
  resource: string;
  quantity: number;
  tradeType: "cash" | "barter";
  price: number;
  receiveResource: string | null;
  receiveQuantity: number;
  memo: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt?: string;
};
type Room = {
  code: string;
  teacherHash: string;
  teamCodes: Record<string, string>;
  state: GameState;
  version: number;
  trades: Trade[];
  createdAt: string;
  updatedAt: string;
};
type Access = { room: Room; role: "teacher" | "team"; countryId: string | null };

const now = () => new Date().toISOString();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomKey = (code: string) => `trade-game:room:${code}`;

function randomCode(n: number) {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return [...a].map((v) => alphabet[v % alphabet.length]).join("");
}
function pin(n = 4) {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return [...a].map((v) => String(v % 10)).join("");
}
async function hash(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function fresh(): GameState {
  return {
    countries: COUNTRIES.map((c) => ({ ...c, stage: 0, tech: false, r: { ...c.r } })),
    status: "waiting",
    logs: [{ t: now(), m: "게임방을 만들었습니다." }],
  };
}
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function publicTrades(a: Access) {
  return a.room.trades
    .filter(
      (t) =>
        a.role === "teacher" ||
        t.sellerId === a.countryId ||
        t.buyerId === a.countryId
    )
    .slice(0, 80);
}
function payload(a: Access) {
  return {
    roomCode: a.room.code,
    role: a.role,
    countryId: a.countryId,
    state: a.room.state,
    version: a.room.version,
    teamCodes: a.role === "teacher" ? a.room.teamCodes : undefined,
    trades: publicTrades(a),
  };
}
async function getRoom(code: string) {
  return getJson<Room>(roomKey(code));
}
async function authorize(roomCode: string, key: string): Promise<Access | null> {
  const room = await getRoom(roomCode);
  if (!room) return null;
  if ((await hash(key)) === room.teacherHash) {
    return { room, role: "teacher", countryId: null };
  }
  const match = Object.entries(room.teamCodes).find(([, value]) => value === key);
  return match ? { room, role: "team", countryId: match[0] } : null;
}
async function saveRoom(original: Room, next: Room) {
  next.state.logs = next.state.logs.slice(0, 80);
  next.trades = next.trades.slice(0, 80);
  next.version = original.version + 1;
  next.updatedAt = now();
  return compareAndSetJson(roomKey(original.code), original.version, next);
}
function cloneRoom(room: Room): Room {
  return structuredClone(room);
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const roomCode = (u.searchParams.get("room") || "").toUpperCase();
    const key = req.headers.get("x-game-key") || "";
    const a = await authorize(roomCode, key);
    if (!a) return json({ error: "방 코드 또는 접속 코드가 맞지 않습니다." }, 403);
    return json(payload(a));
  } catch (error) {
    console.error("GET /api/game failed", error);
    return json(publicStorageError(error), 500);
  }
}

export async function POST(req: Request) {
  try {
    const p = (await req.json()) as any;

    if (p.op === "create") {
      const teacherPin = pin(6);
      const teamCodes = Object.fromEntries(COUNTRIES.map((c) => [c.id, pin()]));
      for (let i = 0; i < 6; i++) {
        const roomCode = randomCode(6);
        const stamp = now();
        const room: Room = {
          code: roomCode,
          teacherHash: await hash(teacherPin),
          teamCodes,
          state: fresh(),
          version: 1,
          trades: [],
          createdAt: stamp,
          updatedAt: stamp,
        };
        if (await setJsonIfMissing(roomKey(roomCode), room)) {
          return json(
            {
              roomCode,
              teacherPin,
              teamCodes,
              countries: COUNTRIES.map(({ id, name, flag }) => ({ id, name, flag })),
            },
            201
          );
        }
      }
      return json({ error: "방 코드를 만들지 못했습니다. 다시 시도해주세요." }, 503);
    }

    const roomCode = String(p.roomCode || "").toUpperCase();
    const key = String(p.key || "");
    const a = await authorize(roomCode, key);
    if (!a) return json({ error: "방 코드 또는 접속 코드가 맞지 않습니다." }, 403);

    if (p.op === "join") return json(payload(a));
    if (p.op !== "action") return json({ error: "올바르지 않은 요청입니다." }, 400);

    const action = p.action;

    if (action.kind === "offer") {
      if (a.role !== "team") return json({ error: "모둠만 거래를 제안할 수 있습니다." }, 403);
      if (a.room.state.status !== "playing") return json({ error: "게임이 진행 중이 아닙니다." }, 400);

      const buyer = String(action.buyerId);
      const resource = String(action.resource);
      const quantity = Number(action.quantity);
      const tradeType: "cash" | "barter" = action.tradeType === "barter" ? "barter" : "cash";
      const price = Number(action.price);
      const receiveResource = tradeType === "barter" ? String(action.receiveResource) : null;
      const receiveQuantity = tradeType === "barter" ? Number(action.receiveQuantity) : 0;
      const validResources = ["oil", "iron", "gold", "wood", "labor"];

      if (
        !COUNTRIES.some((c) => c.id === buyer) ||
        buyer === a.countryId ||
        !validResources.includes(resource) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        (tradeType === "cash" && (!Number.isInteger(price) || price < 0)) ||
        (tradeType === "barter" &&
          (!receiveResource ||
            !validResources.includes(receiveResource) ||
            receiveResource === resource ||
            !Number.isInteger(receiveQuantity) ||
            receiveQuantity < 1))
      ) {
        return json({ error: "거래 내용을 확인하세요." }, 400);
      }

      const seller = a.room.state.countries.find((c) => c.id === a.countryId)!;
      if ((seller.r as any)[resource] < quantity) return json({ error: "판매할 재고가 부족합니다." }, 400);

      const next = cloneRoom(a.room);
      next.trades.unshift({
        id: crypto.randomUUID(),
        sellerId: a.countryId!,
        buyerId: buyer,
        resource,
        quantity,
        tradeType,
        price: tradeType === "cash" ? price : 0,
        receiveResource,
        receiveQuantity,
        memo: String(action.memo || "").slice(0, 80),
        status: "pending",
        createdAt: now(),
      });
      const saved = await saveRoom(a.room, next);
      if (saved !== "ok") return json({ error: "다른 작업과 겹쳤습니다. 다시 눌러주세요." }, 409);
      return json({ ok: true });
    }

    if (action.kind === "resolve") {
      const tradeId = String(action.tradeId || "");
      const tr = a.room.trades.find((t) => t.id === tradeId && t.status === "pending");
      if (!tr) return json({ error: "이미 처리되었거나 없는 거래입니다." }, 409);
      if (a.role !== "teacher" && tr.buyerId !== a.countryId) {
        return json({ error: "이 거래를 처리할 권한이 없습니다." }, 403);
      }

      const next = cloneRoom(a.room);
      const nextTrade = next.trades.find((t) => t.id === tradeId)!;

      if (action.decision === "reject") {
        nextTrade.status = "rejected";
        nextTrade.resolvedAt = now();
        const saved = await saveRoom(a.room, next);
        if (saved !== "ok") return json({ error: "다른 작업과 겹쳤습니다. 다시 눌러주세요." }, 409);
        return json({ ok: true });
      }

      const seller = next.state.countries.find((c) => c.id === nextTrade.sellerId)!;
      const buyer = next.state.countries.find((c) => c.id === nextTrade.buyerId)!;
      if ((seller.r as any)[nextTrade.resource] < nextTrade.quantity) {
        return json({ error: "판매 국가의 재고가 부족합니다." }, 409);
      }

      if (nextTrade.tradeType === "barter") {
        if (!nextTrade.receiveResource || (buyer.r as any)[nextTrade.receiveResource] < nextTrade.receiveQuantity) {
          return json({ error: "구매 국가의 교환 자원이 부족합니다." }, 409);
        }
        (seller.r as any)[nextTrade.resource] -= nextTrade.quantity;
        (buyer.r as any)[nextTrade.resource] += nextTrade.quantity;
        (buyer.r as any)[nextTrade.receiveResource] -= nextTrade.receiveQuantity;
        (seller.r as any)[nextTrade.receiveResource] += nextTrade.receiveQuantity;
      } else {
        if (buyer.money < nextTrade.price) return json({ error: "구매 국가의 돈이 부족합니다." }, 409);
        (seller.r as any)[nextTrade.resource] -= nextTrade.quantity;
        (buyer.r as any)[nextTrade.resource] += nextTrade.quantity;
        seller.money += nextTrade.price;
        buyer.money -= nextTrade.price;
      }

      nextTrade.status = "accepted";
      nextTrade.resolvedAt = now();
      next.state.logs.unshift({
        t: now(),
        m: `${seller.flag} ${seller.name} → ${buyer.flag} ${buyer.name}: ${nextTrade.tradeType === "barter" ? "물물교환" : "현금 거래"} 완료`,
      });
      const saved = await saveRoom(a.room, next);
      if (saved !== "ok") return json({ error: "다른 작업과 겹쳤습니다. 다시 눌러주세요." }, 409);
      return json({ ok: true });
    }

    const next = cloneRoom(a.room);
    const state = next.state;
    const targetId = a.role === "team" ? a.countryId : String(action.countryId || "");
    const country = state.countries.find((x) => x.id === targetId);

    if (action.kind === "start" || action.kind === "reset") {
      if (a.role !== "teacher") return json({ error: "교사만 게임을 제어할 수 있습니다." }, 403);
      next.state = action.kind === "reset" ? fresh() : state;
      if (action.kind === "reset") next.trades = [];
      next.state.status = "playing";
      next.state.logs.unshift({
        t: now(),
        m: action.kind === "reset" ? "새 게임을 시작했습니다." : "교사가 게임을 시작했습니다.",
      });
      const saved = await saveRoom(a.room, next);
      if (saved !== "ok") return json({ error: "다른 작업과 겹쳤습니다. 다시 시도해주세요." }, 409);
      return json({ ok: true });
    }

    if (!country) return json({ error: "국가를 찾을 수 없습니다." }, 400);
    if (state.status !== "playing") return json({ error: "게임이 진행 중이 아닙니다." }, 400);

    if (action.kind === "buyTech") {
      if (country.stage >= 8 || country.tech) return json({ error: "현재 구매할 기술이 없습니다." }, 400);
      const step = STEPS[country.stage + 1];
      if (country.money < step.cost) return json({ error: "기술 개발 비용이 부족합니다." }, 400);
      country.money -= step.cost;
      country.tech = true;
      state.logs.unshift({ t: now(), m: `${country.flag} ${country.name}: ${step.tech} 구매` });
    } else if (action.kind === "develop") {
      if (country.stage >= 8 || !country.tech) return json({ error: "먼저 기술을 구매하세요." }, 400);
      const step: any = STEPS[country.stage + 1];
      const missing = Object.entries(step.req).filter(([k, v]) => (country.r as any)[k] < (v as number));
      if (missing.length) return json({ error: "부족한 자원이 있습니다." }, 400);
      for (const [k, v] of Object.entries(step.req)) (country.r as any)[k] -= v as number;
      country.stage++;
      country.tech = false;
      if (country.stage === 8) state.status = "finished";
      state.logs.unshift({ t: now(), m: `${country.flag} ${country.name}: ${country.stage}단계 ${step.name} 달성` });
    } else if (action.kind === "fine") {
      if (a.role !== "teacher") return json({ error: "교사만 벌금을 부과할 수 있습니다." }, 403);
      if (country.money < 10) return json({ error: "벌금을 낼 돈이 없습니다." }, 400);
      country.money -= 10;
      state.logs.unshift({ t: now(), m: `${country.flag} ${country.name}: ${String(action.reason || "규칙 위반")} 벌금 10만원` });
    } else {
      return json({ error: "지원하지 않는 작업입니다." }, 400);
    }

    const saved = await saveRoom(a.room, next);
    if (saved !== "ok") return json({ error: "다른 작업과 겹쳤습니다. 다시 시도해주세요." }, 409);
    return json({ ok: true });
  } catch (error) {
    console.error("POST /api/game failed", error);
    return json(publicStorageError(error), 500);
  }
}
