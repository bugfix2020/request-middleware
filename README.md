# @bugfix2019/request-middleware

[![npm version](https://img.shields.io/npm/v/@bugfix2019/request-middleware.svg)](https://www.npmjs.com/package/@bugfix2019/request-middleware)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

强大的请求中间件库，支持 ctx 上下文，兼容 axios、fetch，并支持 EventSource(SSE)。

## 📖 前言

这个库的设计灵感来源于多个优秀的框架和库：

- **Express**：用 `next()` 把多个中间件串起来，按顺序执行。https://expressjs.com/
- **Koa**：用 `await next()` 形成经典「洋葱模型」：`await next()` 前做前置逻辑，之后做后置逻辑。https://github.com/koajs/koa
- **Gin**：通过 `c.Next()` 执行后续 handlers；`Next()` 前后适合做前/后置处理与耗时统计。https://gin-gonic.com/en/docs/examples/custom-middleware/

受这些启发，我们希望在前端请求层面也能拥有同样的中间件体验：把鉴权、重试、缓存、节流等通用逻辑沉淀为中间件，业务代码只关注请求本身。

## ✨ 特性

- 🎯 **100% TypeScript** - 完整的类型支持
- 🧅 **洋葱模型** - Koa 风格的中间件机制
- 🔗 **上下文支持** - 贯穿请求生命周期的 ctx 对象
- 🔌 **适配器模式** - 支持 axios、fetch，可扩展自定义 adapter
- 📦 **官方中间件** - 内置缓存、重试、节流等中间件
- 🔄 **EventSource 支持** - 支持 Server-Sent Events (SSE) via @microsoft/fetch-event-source
- 🚀 **零核心依赖** - 轻量级设计

## 📦 安装

```bash
# npm
npm install @bugfix2019/request-middleware

# pnpm
pnpm add @bugfix2019/request-middleware

# yarn
yarn add @bugfix2019/request-middleware
```

## 🚀 快速开始

```typescript
import axios from 'axios';
import { createHttpClient, axiosAdapter } from '@bugfix2019/request-middleware';

// 创建 axios 实例
const axiosInstance = axios.create({
  baseURL: 'https://api.example.com',
});

// 创建 HTTP Client（组合 adapter + middlewares）
const client = createHttpClient({
  adapter: axiosAdapter(axiosInstance),
  defaults: {
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  },
});

// 发送请求
const response = await client.get<{ id: string; name: string }>('/users/1');
console.log(response.data);
```

## 🧅 中间件机制

中间件采用洋葱模型，请求会依次通过所有中间件，响应则按相反顺序返回：

```
请求 → [中间件1] → [中间件2] → [中间件3] → 实际请求
响应 ← [中间件1] ← [中间件2] ← [中间件3] ← 实际响应
```

### 编写自定义中间件

```typescript
import type { HttpContext, Middleware } from '@bugfix2019/request-middleware';
import { createHttpClient } from '@bugfix2019/request-middleware';

const myMiddleware: Middleware<HttpContext> = async (ctx, next) => {
  // 请求前处理
  const startTime = Date.now();
  console.log('请求开始:', ctx.request.method, ctx.request.url);

  await next(); // 调用下一个中间件

  // 响应后处理
  const duration = Date.now() - startTime;
  ctx.state.duration = duration;
  console.log('请求完成, 耗时:', duration, 'ms', 'status:', ctx.response?.status);
};

const client = createHttpClient({
  adapter, // axiosAdapter(...) / fetchAdapter(...) / eventSourceAdapter(...)
  middlewares: [myMiddleware],
});
```

##  上下文 (Context)

每个请求都有一个 `ctx` 对象，包含请求的完整生命周期信息：

```typescript
interface HttpContext<TReqData = unknown, TResData = unknown> {
  /** 请求配置 */
  request: RequestConfig<TReqData>;
  /** 响应对象（响应阶段可用） */
  response?: ResponseData<TResData>;
  /** 错误对象（发生错误时可用） */
  error?: Error;
  /** 共享状态（中间件可自由读写） */
  state: Record<string, unknown>;
}
```

## 📦 官方中间件

目前内置以下中间件：

- `cacheMiddleware`：缓存 GET 请求的响应（简单内存缓存）
- `createRetryMiddleware(options)`：失败自动重试
- `createThrottleMiddleware(options)`：节流/限流

后续计划：预计在 `0.0.4` 中把这些 `官方中间件` 从当前包里拆分出来（以独立入口/独立包的形式提供），让默认安装的包体积更小；核心的 Engine / Client / Adapters 会继续保持稳定。

```typescript
import { createHttpClient } from '@bugfix2019/request-middleware';
import {
  cacheMiddleware,
  createRetryMiddleware,
  createThrottleMiddleware,
} from '@bugfix2019/request-middleware/engine';

const client = createHttpClient({
  adapter,
  middlewares: [
    createRetryMiddleware({ retries: 2, delay: 200 }),
    createThrottleMiddleware({ limit: 5, interval: 1000 }),
    cacheMiddleware,
  ],
});
```

## 🔧 配置请求拦截器和响应拦截器

对于 Fetch 适配器，您可以配置请求拦截器和响应拦截器来修改请求配置或响应数据：

```typescript
import { createHttpClient, createFetchAdapter } from '@bugfix2019/request-middleware';

// 创建带有拦截器的 Fetch 适配器
const adapter = createFetchAdapter({
  baseURL: 'https://api.example.com',
  interceptors: {
    // 请求拦截器：在发送请求前修改配置
    request: (config) => {
      console.log('发送请求:', config.url);
      // 添加认证头
      return {
        ...config,
        headers: {
          ...config.headers,
          'Authorization': 'Bearer ' + getToken(),
        },
      };
    },
    // 响应拦截器：在接收响应后修改数据
    response: (response) => {
      console.log('接收响应:', response.status);
      // 处理响应数据
      return {
        ...response,
        data: transformResponseData(response.data),
      };
    },
  },
});

// 创建 HTTP Client
const client = createHttpClient({ adapter });
```

拦截器函数可以是同步的或异步的（返回 Promise）。

## 🔄 EventSource 支持

request-middleware 支持使用 @microsoft/fetch-event-source 进行 Server-Sent Events (SSE) 连接：

```typescript
import {
  createEventSourceAdapter,
  createHttpClient,
  type EventSourceSession,
} from '@bugfix2019/request-middleware';

// 创建 EventSource 适配器
const adapter = createEventSourceAdapter({
  baseURL: 'https://api.example.com',
  onMessage: (event) => {
    console.log('收到消息:', event.data);
  },
  onOpen: (response) => {
    console.log('连接已打开，状态:', response.status);
  },
  onError: (error) => {
    console.error('连接错误:', error);
  },
  onClose: () => {
    console.log('连接已关闭');
  },
});

// 创建 HTTP Client
const client = createHttpClient({ adapter });

// 发起 SSE 连接（支持 GET/POST/JSON body/headers/timeout/signal）
const response = await client.post<{ prompt: string }, EventSourceSession>('/events', {
  prompt: 'hello',
});

const session = response.data;
for await (const msg of session.stream) {
  console.log('收到消息:', msg.data);
}
await session.done;
```

EventSource 适配器适用于需要实时数据流的场景，如聊天应用、实时通知等。

## 🔧 API 参考

> 推荐使用 `createHttpClient` 作为 HTTP 客户端入口；`createMiddlewareEngine` 更适合自定义上下文/非 HTTP 场景。

### `createHttpClient(options)`

创建 HTTP 客户端（组合 Engine + Adapter），支持：

- 全局中间件（client 级）
- per-request 额外中间件（仅对单次请求生效）

```typescript
import axios from 'axios';
import { createHttpClient, axiosAdapter } from '@bugfix2019/request-middleware';

const client = createHttpClient({
  adapter: axiosAdapter(axios.create({ baseURL: 'https://api.example.com' })),
  defaults: {
    timeout: 10000,
    headers: { 'X-Custom': 'value' },
  },
});

const response = await client.get('/api/users', {
  params: { page: 1 },
});
```

#### `client.request(config, extraMiddlewares?)`

发送请求。

```typescript
const response = await client.request({
  url: '/api/users',
  method: 'GET',
  params: { page: 1 },
});
```

#### 快捷方法

```typescript
client.get<TResData>(url, config?)
client.post<TReqData, TResData>(url, data?, config?)
client.put<TReqData, TResData>(url, data?, config?)
client.delete<TResData>(url, config?)
client.patch<TReqData, TResData>(url, data?, config?)
```

### `createMiddlewareEngine(options)`

创建通用中间件引擎（与网络无关）。当你希望自己控制 `ctx` 与最终执行逻辑时使用。

```typescript
import { createMiddlewareEngine } from '@bugfix2019/request-middleware';

type Ctx = { state: { traceId?: string } };

const engine = createMiddlewareEngine<Ctx>({
  middlewares: [
    async (ctx, next) => {
      ctx.state.traceId = 'trace-001';
      await next();
    },
  ],
});

await engine.dispatch(
  { state: {} },
  async () => {
    // final handler
  }
);
```

### 子路径导出

该库在子路径中额外导出一些分组能力：

- `@bugfix2019/request-middleware/engine`：额外导出官方中间件

```typescript
import {
  cacheMiddleware,
  createRetryMiddleware,
  createThrottleMiddleware,
} from '@bugfix2019/request-middleware/engine';
```

---

## 🧪 单元测试与覆盖率

- 运行单测：`pnpm test:run`
- 生成覆盖率：`pnpm test:coverage`
- 覆盖率阈值：见 `vitest.config.ts`（lines/functions/statements 80%，branches 75%）

README 不维护静态覆盖率表，覆盖率以 CI/本地命令输出为准。

---

## 📂 项目结构

```
request-middleware/
├── src/
│   ├── adapters/           # 传输层适配器（axios/fetch/eventSource）
│   ├── client/             # createHttpClient
│   ├── engine/             # 中间件引擎（compose/dispatch/types）
│   ├── middlewares/        # 官方中间件实现（cache/retry/throttle）
│   └── index.ts            # 入口文件
├── tests/                  # 测试文件
├── dist/                   # 构建输出
├── package.json
├── tsconfig.json
├── tsup.config.ts          # 构建配置
└── README.md
```

## 🛠️ 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm run dev

# 构建
pnpm run build

# 运行测试
pnpm test

# 查看覆盖率
pnpm test:coverage
```

## 🧩 版本与不兼容变更

- 本次变更按语义化属于非 breaking：主要是对 EventSource(SSE) adapter 增强（支持 `POST/body/headers/signal/timeout` 等能力）以及补充类型导出。
- 如果你依赖旧行为（例如：自行拼接 SSE 数据增量），请根据实际后端推送策略选择合适的数据合并方式；该库本身不强制内容拼接策略。

## 📜 Changelog

变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 📦 发布到 npm

```bash
# 在本目录执行
cd .hc/request-middleware

# 1) 安装依赖
pnpm install

# 2) 跑单测 + 覆盖率
pnpm test:coverage

# 3) 构建（prepublishOnly 也会自动触发 build）
pnpm build

# 4) 发布（scope 包默认 private，需强制 public）
npm publish --access public
```

## 📄 许可证

MIT

## 👥 贡献者

贡献指南请参考 GitHub 仓库的 CONTRIBUTING：

- https://github.com/bugfix2020/request-middleware/blob/main/CONTRIBUTING.md

贡献者列表请以 GitHub Contributors 页面为准。

## 🔗 相关链接

- [Axios](https://axios-http.com/)
- [Fetch API](https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API)
- [Koa 洋葱模型](https://koajs.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vitest](https://vitest.dev/)
- [pnpm](https://pnpm.io/)

---

## ❓ 常见问题

### Q: 如何在项目中使用？
A: 直接在项目中引入 request-middleware 并结合 axios/fetch 适配器即可，无需特殊配置。

### Q: 如何自定义中间件？
A: 参考文档中的"编写自定义中间件"示例，实现 `(ctx, next) => Promise<void>` 结构即可。

### Q: 如何查看测试覆盖率？
A: 运行 `pnpm test:coverage` 查看详细覆盖率报告。

### Q: 如何贡献代码？
A: 参考 GitHub 仓库的 CONTRIBUTING（见上方链接），Fork 仓库并提交 PR；请确保测试通过且覆盖率满足项目阈值。

---

## 🙏 致谢

感谢所有为本项目做出贡献的开发者！

