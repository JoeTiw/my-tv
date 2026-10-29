/* Starts Tiwari TV. */
(function () {
  'use strict';
  Home.start();
  Inbox.start();
  // For the desktop preview and tests.
  window.TiwariTV = {home: Home, inbox: Inbox, assistant: Assistant, tv: TV};
})();
