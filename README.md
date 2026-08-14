# 時間割変更アプリ v1.0

## 含まれるファイル
- index.html
- style.css
- app.js

## 主な機能
- 通常時間割の登録・編集
- 1コマに複数教員を登録
- 日ごとの変更を通常時間割と分離して保存
- 曜日をまたぐ移動・入れ替え
- 欠員教員を「（名前）」表示
- 代講教員の登録
- 教員・教室の重複チェック
- 変更条件の一括入力
- 複数担当授業で1人だけ不在の場合の安全な自動反映
- 自動反映後の手動修正
- 変更履歴
- JSONバックアップ・復元
- LocalStorage保存

## GitHub Pagesでの公開
1. GitHubで新しいRepositoryを作成
2. index.html / style.css / app.js をRepository直下へアップロード
3. Repositoryの Settings → Pages
4. Build and deployment の Source を Deploy from a branch
5. Branch を main、Folder を /(root) にして Save
6. 数分後に表示されるGitHub PagesのURLを開く
7. そのURLをブックマークして普段はそこから利用

## とても重要
PC上で直接 index.html を開いたときのLocalStorageと、GitHub Pages上のLocalStorageは別です。
本番の時間割登録はGitHub Pages公開後に始めるのがおすすめです。
すでにローカル版へ登録した場合は、バックアップ → JSONを書き出す → GitHub Pages版でJSONを読み込む、で移行できます。

## データ保全
アプリ更新前に「バックアップ」タブからJSONを書き出してください。
アプリのHTML/JS/CSSを更新しても、同じGitHub Pages URL・同じブラウザであればLocalStorageは原則残ります。
ただしブラウザのサイトデータ削除などに備え、JSONバックアップを推奨します。
