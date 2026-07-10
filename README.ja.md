# OpenClaw Model Router MCP

`0.4.0-rc.9`はローカルRCです。外部配布と本番利用は、実動経路QCが終わるまでHOLDです。

## 認証・実行経路

- OpenClaw Gatewayの既存Codex認証だけを使います。
- packageはprovider credentialを受け取らず、provider HTTP endpointへ直接送信しません。
- 別transport・別modelへのfallbackは禁止です。
- Solが全体を判断し、品質が落ちないboundedな低リスク作業だけTerra/Lunaへdownshiftします。
- server safety gateはSol維持または承認停止へ厳しくすることだけができます。

## 必須条件

- OpenClaw `2026.6.10`以上
- Codex認証が正常なこと
- `sessions_yield`以外のtoolを持たない専用OpenClaw agent。OpenClaw 2026.6.10ではread-only core toolが自動露出するため、`tools.deny=["session_status"]`を明示設定
- `MODEL_ROUTER_OPENCLAW_AGENT`に専用agent idを設定

adapterは`openclaw agent`をGateway経由で実行し、model一致、Codex harness、auth profile、fallback 0、tool隔離、token usageを検証します。1つでも確認できなければfail closedです。

```bash
npm run check
npm test
MODEL_ROUTER_OPENCLAW_AGENT=model-router node src/cli.mjs plan "安全な実装計画を作る"
```

`estimate_task`はmodelを呼ばない参考判定、`plan_task`はSol planningのみです。`execute_task`はdefault OFFかつ通常のtools listでは非公開で、client入力から有効化できません。

routing fieldと`openclaw agent`へ渡すmodel IDは、実機のOpenClaw model catalogに登録された`openai/gpt-5.6-*`を使用します。返却metadataではCodex harnessとOpenClaw auth profileを必須検証し、API provider直呼びやAPI key fallbackには切り替えません。

実行modelとtoken usageの正本はOpenClawです。USD表示は設定上の参考推定と明記し、providerの実測請求額として表示しません。

再QCまでGateway変更・再起動・外部公開・第三者導入は禁止です。問題時は未導入状態へ戻し、`0.3.0-rc.2`へは戻しません。
