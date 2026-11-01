/**
 * YouTube再生リスト内の動画を置き換える汎用ツール
 *
 * 使い方：
 * 1. 下の設定を書き換える
 * 2. testPlaylistReplacement() で対象を確認
 * 3. 問題なければ EXECUTE = true に変更
 * 4. replacePlaylistVideos() を実行
 *
 * YouTube Data API v3 の拡張サービスが必要です。
 */

const REPLACE_CONFIG = {
  // 対象の再生リストID
  PLAYLIST_ID: "再生リストID",

  // 置き換え後の動画ID
  NEW_VIDEO_ID: "新動画ID",

  // 置き換えたい旧動画ID（複数指定可能）
  OLD_VIDEO_IDS: [
    "旧動画ID"
  ],

  // false：確認のみ、true：実際に置き換える
  EXECUTE: true
};


/**
 * 再生リスト内の対象動画を確認する
 * 動画の追加・削除は行わない
 */
function testPlaylistReplacement() {
  const config = REPLACE_CONFIG;
  validateReplaceConfig_(config);

  const items = getAllPlaylistItems_(config.PLAYLIST_ID);
  const oldIds = new Set(config.OLD_VIDEO_IDS);

  Logger.log("再生リスト内の動画数：" + items.length);
  Logger.log("置換対象の件数：" +
    items.filter(item =>
      oldIds.has(item.snippet.resourceId.videoId)
    ).length
  );

  items.forEach(item => {
    const videoId = item.snippet.resourceId.videoId;
    Logger.log(
      "位置：" + item.snippet.position +
      " | 対象：" + (oldIds.has(videoId) ? "はい" : "いいえ") +
      " | 動画ID：" + videoId +
      " | タイトル：" + item.snippet.title
    );
  });
}


/**
 * 設定した旧動画を新動画に置き換える
 */

function replacePlaylistVideos() {
  const config = REPLACE_CONFIG;
  validateReplaceConfig_(config);

  if (!config.EXECUTE) {
    throw new Error(
      "実行は停止中です。対象確認後、EXECUTE を true にしてください。"
    );
  }

  const oldIds = new Set(config.OLD_VIDEO_IDS);

  if (oldIds.has(config.NEW_VIDEO_ID)) {
    throw new Error("新動画IDが旧動画IDにも指定されています。");
  }

  const items = getAllPlaylistItems_(config.PLAYLIST_ID)
    .sort((a, b) => a.snippet.position - b.snippet.position);

  const targets = items.filter(item =>
    oldIds.has(item.snippet.resourceId.videoId)
  );

  if (targets.length === 0) {
    throw new Error("置換対象の動画が見つかりません。");
  }

  Logger.log("置換対象件数：" + targets.length);

  // 後ろの位置から処理する
  targets.sort((a, b) =>
    b.snippet.position - a.snippet.position
  );

 

  let success = 0;
  let failed = 0;

  for (const target of targets) {
    const position = target.snippet.position;
    let insertedId = null;

    try {
      // 旧動画がまだ同じ項目IDで存在するか確認
      const current = YouTube.PlaylistItems.list("snippet", {
        id: target.id
      });

      if (!current.items || current.items.length === 0) {
        throw new Error("旧動画の項目が見つかりません。");
      }

      if (
        current.items[0].snippet.playlistId !== config.PLAYLIST_ID ||
        current.items[0].snippet.resourceId.videoId !==
          target.snippet.resourceId.videoId
      ) {
        throw new Error("旧動画の状態が変わっているためスキップします。");
      }

      // 元の位置に新動画を追加
      const inserted = YouTube.PlaylistItems.insert(
        {
          snippet: {
            playlistId: config.PLAYLIST_ID,
            position: position,
            resourceId: {
              kind: "youtube#video",
              videoId: config.NEW_VIDEO_ID
            }
          }
        },
        "snippet"
      );

      insertedId = inserted && inserted.id;

      // 追加処理のレスポンスで新動画を確認
      if (
        !insertedId ||
        !inserted.snippet ||
        !inserted.snippet.resourceId ||
        inserted.snippet.resourceId.videoId !== config.NEW_VIDEO_ID
      ) {
        throw new Error(
          "追加結果を確認できません。旧動画は削除していません。"
        );
      }

      // 新動画の追加確認後に旧動画を削除
      YouTube.PlaylistItems.remove(target.id);

      success++;
      Logger.log(
        "成功 | 元の位置：" + position +
        " | 旧動画項目ID：" + target.id +
        " | 新動画項目ID：" + insertedId
      );

    } catch (error) {
      failed++;
      Logger.log(
        "失敗 | 元の位置：" + position +
        " | 旧動画項目ID：" + target.id +
        " | 追加済み新動画項目ID：" + (insertedId || "不明") +
        " | エラー：" + String(error.message || error)
      );
    }
  }

  Logger.log(
    "処理終了 | 成功：" + success + " | 失敗：" + failed
  );
  Logger.log(
    "処理後は testPlaylistReplacement() で動画数と置換対象を再確認してください。"
  );
}

/**
 * 再生リスト内の全項目をページング取得
 */
function getAllPlaylistItems_(playlistId) {
  const all = [];
  let pageToken;

  do {
    const params = {
      playlistId: playlistId,
      maxResults: 50
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = YouTube.PlaylistItems.list("snippet", params);
    all.push(...(response.items || []));
    pageToken = response.nextPageToken;
  } while (pageToken);

  return all;
}


/**
 * 設定内容の簡易チェック
 */
function validateReplaceConfig_(config) {
  if (
    !config.PLAYLIST_ID ||
    config.PLAYLIST_ID.includes("ここに")
  ) {
    throw new Error("PLAYLIST_ID を設定してください。");
  }

  if (
    !config.NEW_VIDEO_ID ||
    config.NEW_VIDEO_ID.includes("ここに")
  ) {
    throw new Error("NEW_VIDEO_ID を設定してください。");
  }

  if (
    !Array.isArray(config.OLD_VIDEO_IDS) ||
    config.OLD_VIDEO_IDS.length === 0 ||
    config.OLD_VIDEO_IDS.some(id => !id || id.includes("ここに"))
  ) {
    throw new Error("OLD_VIDEO_IDS を設定してください。");
  }

  if (new Set(config.OLD_VIDEO_IDS).size !== config.OLD_VIDEO_IDS.length) {
    throw new Error("OLD_VIDEO_IDS に重複したIDがあります。");
  }
}
