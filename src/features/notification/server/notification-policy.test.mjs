import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  PUSH_AUTH_MAX_LENGTH,
  PUSH_AUTH_MIN_LENGTH,
  PUSH_ENDPOINT_MAX_LENGTH,
  PUSH_P256DH_MAX_LENGTH,
  PUSH_P256DH_MIN_LENGTH,
  hasValidP256dhLength,
  hasValidPushAuthLength,
  hasValidQuietHoursPair,
  isNotificationKindEnabled,
  isWithinQuietHours,
  isValidPushEndpoint,
} from "./notification-policy.ts";

test("通知設定はメッセージ本文のプレビューを既定で隠す", () => {
  assert.equal(DEFAULT_NOTIFICATION_SETTINGS.showMessagePreview, false);
  assert.equal(DEFAULT_NOTIFICATION_SETTINGS.quietHoursStart, null);
  assert.equal(DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnd, null);
});

test("quiet hours and notification kinds are evaluated explicitly", () => {
  assert.equal(isWithinQuietHours(30, 1_380, 420), true);
  assert.equal(isWithinQuietHours(720, 1_380, 420), false);
  assert.equal(isWithinQuietHours(60, 60, 60), false);
  assert.equal(
    isNotificationKindEnabled(
      { ...DEFAULT_NOTIFICATION_SETTINGS, directMessages: false },
      "DIRECT_MESSAGE",
    ),
    false,
  );
  assert.equal(
    isNotificationKindEnabled(DEFAULT_NOTIFICATION_SETTINGS, "MENTION"),
    true,
  );
});

test("通知停止時間は開始と終了を対で検証する", () => {
  const cases = [
    [undefined, undefined, true],
    [null, null, true],
    [0, 1_439, true],
    [1_439, 0, true],
    [undefined, null, false],
    [null, undefined, false],
    [null, 0, false],
    [0, null, false],
    [-1, 0, false],
    [0, 1_440, false],
    [0.5, 60, false],
  ];

  for (const [start, end, expected] of cases) {
    assert.equal(
      hasValidQuietHoursPair(start, end),
      expected,
      `${String(start)}-${String(end)}`,
    );
  }
});

test("Push購読URLと暗号鍵の長さを検証する", () => {
  assert.equal(
    isValidPushEndpoint("https://fcm.googleapis.com/fcm/send/subscription"),
    true,
  );
  assert.equal(
    isValidPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"),
    true,
  );
  assert.equal(isValidPushEndpoint("https://web.push.apple.com/QWERTY"), true);
  assert.equal(
    isValidPushEndpoint("https://wns2-pn.notify.windows.com/w/?token=x"),
    true,
  );
  assert.equal(isValidPushEndpoint("https://push.example/subscription"), false);
  assert.equal(isValidPushEndpoint("https://127.0.0.1/subscription"), false);
  assert.equal(isValidPushEndpoint("https://localhost/subscription"), false);
  assert.equal(
    isValidPushEndpoint("https://fcm.googleapis.com.evil.example/subscription"),
    false,
  );
  assert.equal(isValidPushEndpoint("http://push.example/subscription"), false);
  assert.equal(isValidPushEndpoint("not-a-url"), false);
  assert.equal(
    isValidPushEndpoint(
      `https://example.com/${"a".repeat(PUSH_ENDPOINT_MAX_LENGTH)}`,
    ),
    false,
  );

  const keyCases = [
    [hasValidP256dhLength, PUSH_P256DH_MIN_LENGTH, PUSH_P256DH_MAX_LENGTH],
    [hasValidPushAuthLength, PUSH_AUTH_MIN_LENGTH, PUSH_AUTH_MAX_LENGTH],
  ];

  for (const [validator, minimum, maximum] of keyCases) {
    assert.equal(validator("a".repeat(minimum)), true);
    assert.equal(validator("a".repeat(maximum)), true);
    assert.equal(validator("a".repeat(minimum - 1)), false);
    assert.equal(validator("a".repeat(maximum + 1)), false);
  }
});
