# weather

このディレクトリは、米国気象局（NWS）のAPIを利用して天気情報や気象警報を取得するMCPサーバの実装です。

以下を参考に作成
https://modelcontextprotocol.io/quickstart/server#node

## 主な内容
- `src/` : TypeScriptによるサーバ本体のソースコード
- `package.json` : 依存パッケージやスクリプトの管理
- `tsconfig.json` : TypeScriptの設定

## 使い方
1. dockerイメージのビルド
   ```sh
   docker build -t weather-mcp .
   ```
2. dockerコンテナの起動
   ```sh
   docker run -it -rm -p 3000:3000 weather-mcp
   ```

## 提供ツール
- `get_forecast`：緯度・経度を指定して天気予報を取得
- `get_alerts`：州コード（例: CA, TX）を指定して気象警報を取得

## 注意事項
- 米国気象局（NWS）のAPIを利用しているため、米国内の地点のみ対応しています。
- MCPプロトコル対応のクライアントから利用してください。 