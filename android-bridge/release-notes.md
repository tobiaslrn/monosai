Monosai's optional read-only AnkiDroid bridge for Android 16+ and AnkiDroid 2.24+.

Install the APK, grant AnkiDroid access, and start the bridge. In the Monosai PWA,
choose Add source → AnkiDroid bridge. Packages remain the simpler setup option.

The idle bridge does not poll or hold a wake lock. It can restart after reboot
while enabled and does not request notification permission. Android retains its
Active apps entry and can stop background apps.

Android asks you to confirm APK installation and updates. The PWA updates
separately through its existing service worker.
