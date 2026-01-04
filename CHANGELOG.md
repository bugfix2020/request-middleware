# Changelog

本项目的所有显著变更都会记录在本文件中。

---

## [0.0.3] - 2026-01-04

### Added

- EventSource(SSE) adapter 增强：支持 `method`/`body`/`headers`/`signal`/`timeout` 等能力，并返回 `EventSourceSession`（包含 `stream` AsyncIterable 与 `done` Promise）。
- 类型导出补齐：`EventSourceMessage` / `EventSourceSession` 可从包根路径以及 `./adapters` 子路径导入。

### Changed

- README 示例与 API 对齐（不再引用不存在的旧 API），并补充测试/覆盖率与发布命令说明。

## [0.0.2] - 2025-12-15

- 隐约记得是一些小的修改 但是忘记了。

## [0.0.1] - 2025-12-02

- 初始版本发布。