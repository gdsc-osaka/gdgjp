# agent-host リファクタリング — 残タスク

`index.md` の 14 ステージについて、2026-09-05 時点で残っている作業のみをまとめる。
完了済みの内容は各ステージファイルと `docs/agents-local-mvp/adr.md`（ADR-024〜031）を参照。
01〜09 は実装漏れなし。以下は 10・13・14 のみ。

## Stage 10 — control-plane-release

- [ ] Lima 上での systemd/apparmor/sudoers/useradd の実機統合テストを CI に配線する。
      ADR-030 が「今後の課題」と明記したまま。`.github/workflows/agent-host-release.yml`
      には現状 Lima ステップが無い。**2026-09-06 時点で調査済み**: Lima 自体は不要と判明
      （ADR-030/032 が Lima に言及するのは著者が macOS 開発機から検証していたためで、
      `ubuntu-latest` runner は最初から実 Ubuntu VM で sudo/systemd が使える）。実装計画を
      `docs/plans/01-agent-host-lima-ci-and-permission-separation.md` に起票済み、レビュー待ち。
- [x] リポジトリ設定変更（2026-09-06、gh CLI で確認・適用済み）:
  - branch protection — **調査の結果すでに有効だった**（ruleset `main`, id 15974538。
    PR 必須・承認 1・force-push 禁止・削除禁止。classic branch-protection API では
    見えず ruleset API でのみ確認できる点に注意）
  - 署名コミット必須化 — 上記 ruleset に `required_signatures` ルールを追加して対応
  - GitHub Environment protection rule — `Production` environment に
    `deployment_branch_policy: {protected_branches: true}` を設定（従来は無保護で
    どのブランチからでも deploy 可能だった）
- [ ] 「エージェントから到達できるどの経路もリリース生成リポジトリへ push できない」という
      不変条件を、ファイル権限だけでなく GitHub 側の権限分離（wiki transport token vs
      monorepo write 権限）でもテスト固定する。上記と同じ実装計画ファイルの Design Part 2
      に設計済み（`NPM_READ_TOKEN` が唯一エージェントスロットに到達する GitHub 資格情報）、
      実装待ち。

## Stage 13 — xangi-packaging

ADR-031 の残タスク 1〜6 は本セッションで完了（`gdg-jp/xangi` への移管、`@gdg-jp/gdg-lib@0.1.0`
publish、xangi の依存切替、CI 修正、ホスト側 GitHub Packages 認証、pin 更新）。

- [ ] **残タスク 7: `/opt/gdgjp` の完全撤去。** コード上の前提（xangi・agents-index・
      langfuse-forwarder の自己完結化）はすべて揃った。2026-09-05 に `mincra-srv` で
      実施した `gdg agent-host apply --dry-run --diff`（57 件差分）に `/opt/gdgjp` への
      参照は一切無いことを確認済み — 現行 spec/converger はこの旧チェックアウトに依存
      しない。実体の物理削除のみ残っており、operator の最終確認待ち。
- [x] `agents-index/src/indexer/embed.ts` の埋め込みモデル dtype 誤り
      （`dtype: "q8"` → `onnx/model_quantized.onnx` を要求するが
      `intfloat/multilingual-e5-small` に存在しない）を `dtype: "fp32"`
      （`onnx/model.onnx` に一致）へ修正。`pnpm sync:agent-host-assets` で
      `cli/internal/agenthost/assets/` へ同期済み。`agents-index.service` は
      artifacts-rev 方式で再起動する。**反映には `cli` の新リリース + 実機再インストール
      + `apply` 再実行が必要。**
- [x] `cli/internal/agenthost/plan.go` の `buildLangfuseForwarderResources` が
      `filepath.Join(prefix, "opt", ...)` を使っており、ライブモード（`prefix == ""`）で
      相対パスを生成 → `sudo` 実行時の cwd 配下にソースツリーを書き出していた。
      他の `/opt/*` と同じ文字列結合（`prefix + "/opt/langfuse-forwarder"`）へ統一し、
      `TestLangfuseForwarderResourcePathsAreAbsolute` で固定。**反映には同上のリリース
      サイクルが必要。** 実機の `/opt/langfuse-forwarder` が最新ソースに更新されているかは
      正しいパスでの `apply` 再実行後に要確認。
- [ ] xangi のローカル git remote（`~/proj/xangi` 由来の環境に残っていれば）を
      `gdg-jp/xangi` に向け直す。GitHub のリダイレクトで動作はするが、恒久対応ではない。
- [ ] `gdg-lib` パッケージの消費者が増えた場合、Package settings の
      Manage Actions access に都度リポジトリを追加するか、visibility を `internal` に
      変えるかを判断する（今回は `gdg-jp/xangi` のみ追加、private のまま維持）。
- [ ] xangi の `main` ブランチ CI が 2026-08-20 頃から `prettier --check` で
      失敗し続けている（Stage 13 とは無関係の既存 issue）。7 ファイルの format 崩れ
      （`src/account-link.ts` ほか）。別タスクとして spawn 済み。

## Stage 14 — antigravity-backend

機構（ACL ゲート、hooks/settings/permissions バンドル、能力レジストリ）は実装済みだが、
本番投入条件が未達。ADR-032 の残タスク:

- [x] `pins.antigravity`（version + sha256）を `agent-host.schema.json` に追加し、
      具体的な `agy` バイナリ(`mincra-srv` に実際に入っている v1.1.27)をピン留めした。
      x86_64 の sha256 のみ必須(`agy` は公開マルチアーチ配布が無いため aarch64 は無し)。
      他の pin と異なり `backend.name == "antigravity"` の場合のみ検証される
      (既存テストフィクスチャを含む他の全 spec は影響を受けない)。
- [ ] pin 済みバイナリに対して、ADR-032 の手動実機検証（PreToolUse deny/allow、
      `command(wk)`/`command(gws)` permission ゲート）と同等の E2E をやり直し、
      再現性を確認する。
- [ ] Lima VM 上での OS サンドボックス境界（`--sandbox`/`enableTerminalSandbox`）の
      実機検証。現状 `OSSandbox: "none"` のまま安全側に倒されている。
- [ ] `--dangerously-skip-permissions` とフック `deny` の優先順位を実機で検証する。
- [ ] 上記が揃うまで `backend.go` の `antigravityPolicy.Capabilities()` は
      `OSSandbox: "none"` / `ToolGate: "none"` のままにする
      （`productionMinimum` を満たさないため `backend.name: antigravity` の spec は
      現状 apply されない — 意図した安全側動作）。
