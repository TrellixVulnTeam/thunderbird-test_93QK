/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Functionality for the main application window (aka the 3pane) usually
 * consisting of folder pane, thread pane and message pane.
 */

/* global MozElements */

/* import-globals-from ../../components/im/content/chat-messenger.js */
/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailWindow.js */
/* import-globals-from msgViewNavigation.js */
/* import-globals-from threadPane.js */
/* import-globals-from utilityOverlay.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "ConversationOpener",
  "resource:///modules/ConversationOpener.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailUtils",
  "resource:///modules/MailUtils.jsm"
);

// Controller object for folder pane.
var FolderPaneController = {
  get notificationBox() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "bottom");
        document
          .getElementById("messenger-notification-footer")
          .append(element);
      });
    }
    return this._notificationBox;
  },

  supportsCommand(command) {
    switch (command) {
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
      case "button_shiftDelete":
        // Even if the folder pane has focus, don't do a folder delete if
        // we have a selected message, but do a message delete instead.
        // Return false here supportsCommand and let the command fall back
        // to the DefaultController.
        if (gFolderDisplay.selectedCount != 0) {
          return false;
        }
      // else fall through
      case "cmd_cut":
      case "cmd_copy":
      case "cmd_paste":
        return true;

      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      case "cmd_cut":
      case "cmd_copy":
      case "cmd_paste":
        return false;
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
      case "button_shiftDelete": {
        // Make sure the button doesn't show "Undelete" for folders.
        UpdateDeleteToolbarButton();
        let folders = gFolderTreeView.getSelectedFolders();
        if (folders.length) {
          // XXX Figure out some better way/place to update the folder labels.
          UpdateDeleteLabelsFromFolderCommand(folders[0], command);
          return (
            CanDeleteFolder(folders[0]) && folders[0].isCommandEnabled(command)
          );
        }
        return false;
      }
      default:
        return false;
    }
  },

  doCommand(command) {
    // if the user invoked a key short cut then it is possible that we got here for a command which is
    // really disabled. kick out if the command should be disabled.
    if (!this.isCommandEnabled(command)) {
      return;
    }

    switch (command) {
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
      case "button_shiftDelete":
      case "cmd_deleteFolder":
        gFolderTreeController.deleteFolder();
        break;
    }
  },

  onEvent(event) {},
};

function UpdateDeleteLabelsFromFolderCommand(folder, command) {
  if (command != "cmd_delete") {
    return;
  }

  if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    goSetMenuValue(command, "valueFolder");
    goSetAccessKey(command, "valueFolderAccessKey");
  } else if (folder.server.type == "nntp") {
    goSetMenuValue(command, "valueNewsgroup");
    goSetAccessKey(command, "valueNewsgroupAccessKey");
  } else {
    goSetMenuValue(command, "valueFolder");
    goSetAccessKey(command, "valueFolderAccessKey");
  }
}

// DefaultController object (handles commands when one of the trees does not have focus)
var DefaultController = {
  /* eslint-disable complexity */
  supportsCommand(command) {
    switch (command) {
      case "cmd_createFilterFromPopup":
      case "cmd_archive":
      case "button_archive":
      case "cmd_newMessage":
      case "cmd_reply":
      case "button_reply":
      case "cmd_replySender":
      case "cmd_replyGroup":
      case "button_followup":
      case "cmd_replyall":
      case "button_replyall":
      case "cmd_replylist":
      case "button_replylist":
      case "cmd_forward":
      case "button_forward":
      case "cmd_forwardInline":
      case "cmd_forwardAttachment":
      case "cmd_redirect":
      case "cmd_editAsNew":
      case "cmd_editDraftMsg":
      case "cmd_newMsgFromTemplate":
      case "cmd_editTemplateMsg":
      case "cmd_createFilterFromMenu":
      case "cmd_delete":
      case "cmd_cancel":
      case "cmd_deleteFolder":
      case "button_delete":
      case "button_junk":
      case "button_showconversation":
      case "cmd_shiftDelete":
      case "button_shiftDelete":
      case "button_nextMsg":
      case "cmd_nextMsg":
      case "button_next":
      case "cmd_nextUnreadMsg":
      case "cmd_nextFlaggedMsg":
      case "cmd_nextUnreadThread":
      case "button_previousMsg":
      case "cmd_previousMsg":
      case "button_previous":
      case "cmd_previousUnreadMsg":
      case "cmd_previousFlaggedMsg":
      case "button_goForward":
      case "button_goBack":
      case "cmd_goForward":
      case "cmd_goBack":
      case "cmd_goStartPage":
      case "cmd_undoCloseTab":
      case "cmd_viewClassicMailLayout":
      case "cmd_viewWideMailLayout":
      case "cmd_viewVerticalMailLayout":
      case "cmd_toggleFolderPane":
      case "cmd_toggleFolderPaneCols":
      case "cmd_toggleMessagePane":
      case "cmd_viewAllMsgs":
      case "cmd_viewUnreadMsgs":
      case "cmd_viewThreadsWithUnread":
      case "cmd_viewWatchedThreadsWithUnread":
      case "cmd_viewIgnoredThreads":
      case "cmd_undo":
      case "cmd_redo":
      case "cmd_expandAllThreads":
      case "cmd_collapseAllThreads":
      case "cmd_renameFolder":
      case "cmd_sendUnsentMsgs":
      case "cmd_subscribe":
      case "cmd_openMessage":
      case "cmd_openConversation":
      case "button_print":
      case "cmd_print":
      case "cmd_saveAsFile":
      case "cmd_saveAsTemplate":
      case "cmd_properties":
      case "cmd_viewPageSource":
      case "cmd_setFolderCharset":
      case "cmd_reload":
      case "button_getNewMessages":
      case "cmd_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
      case "cmd_getNextNMessages":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_search":
      case "button_mark":
      case "cmd_tag":
      case "cmd_addTag":
      case "cmd_manageTags":
      case "cmd_removeTags":
      case "cmd_tag1":
      case "cmd_tag2":
      case "cmd_tag3":
      case "cmd_tag4":
      case "cmd_tag5":
      case "cmd_tag6":
      case "cmd_tag7":
      case "cmd_tag8":
      case "cmd_tag9":
      case "cmd_toggleRead":
      case "cmd_markAsRead":
      case "cmd_markAsUnread":
      case "cmd_markAllRead":
      case "cmd_markThreadAsRead":
      case "cmd_markReadByDate":
      case "cmd_markAsFlagged":
      case "cmd_markAsJunk":
      case "cmd_markAsNotJunk":
      case "cmd_recalculateJunkScore":
      case "cmd_displayMsgFilters":
      case "cmd_applyFiltersToSelection":
      case "cmd_applyFilters":
      case "cmd_runJunkControls":
      case "cmd_deleteJunk":
      case "button_file":
      case "cmd_emptyTrash":
      case "cmd_compactFolder":
      case "button_compact":
      case "cmd_settingsOffline":
      case "cmd_selectAll":
      case "cmd_selectThread":
      case "cmd_moveToFolderAgain":
      case "cmd_selectFlagged":
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_fontSizeReset":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
      case "cmd_stop":
      case "cmd_chat":
      case "cmd_watchThread":
      case "cmd_killThread":
      case "cmd_killSubthread":
        return true;
      case "cmd_fontSizeReduce":
        return UIFontSize.size > UIFontSize.MIN_VALUE;
      case "cmd_fontSizeEnlarge":
        return UIFontSize.size < UIFontSize.MAX_VALUE;
      case "cmd_downloadFlagged":
      case "cmd_downloadSelected":
      case "cmd_synchronizeOffline":
        return MailOfflineMgr.isOnline();
      case "cmd_newFolder":
      case "cmd_newVirtualFolder":
        return !!gFolderTreeController;
      case "cmd_goFolder":
        return !!gFolderTreeView;
      case "cmd_joinChat":
      case "cmd_addChatBuddy":
      case "cmd_chatStatus":
        return !!chatHandler;

      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      case "cmd_delete":
        UpdateDeleteCommand();
      // fall through
      case "button_delete":
        UpdateDeleteToolbarButton();
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.deleteMsg
        );
      case "cmd_shiftDelete":
      case "button_shiftDelete":
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.deleteNoTrash
        );
      case "cmd_cancel":
        return (
          gFolderDisplay.selectedCount == 1 &&
          gFolderDisplay.selectedMessageIsNews
        );
      case "cmd_deleteFolder":
        var folders = gFolderTreeView.getSelectedFolders();
        if (folders.length == 1) {
          let folder = folders[0];
          if (folder.server.type == "nntp") {
            // Just disable the command for news unless it is a Saved search folder.
            return folder.getFlag(Ci.nsMsgFolderFlags.Virtual);
          }
          return CanDeleteFolder(folder);
        }
        return false;
      case "button_junk":
        UpdateJunkToolbarButton();
        return gFolderDisplay.getCommandStatus(Ci.nsMsgViewCommandType.junk);
      case "cmd_killThread":
      case "cmd_killSubthread":
        return gFolderDisplay.selectedCount > 0;
      case "cmd_watchThread":
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.toggleThreadWatched
        );
      case "cmd_createFilterFromPopup":
      case "cmd_createFilterFromMenu":
        return (
          gFolderDisplay.selectedCount == 1 &&
          gFolderDisplay.selectedMessage.folder &&
          gFolderDisplay.selectedMessage.folder.server.canHaveFilters
        );
      case "cmd_openConversation":
      case "button_showconversation":
        return (
          gFolderDisplay.selectedCount == 1 &&
          ConversationOpener.isMessageIndexed(gFolderDisplay.selectedMessage)
        );
      case "cmd_saveAsFile":
        return gFolderDisplay.selectedCount > 0;
      case "cmd_saveAsTemplate":
        if (gFolderDisplay.selectedCount > 1) {
          return false;
        } // else fall through
      case "cmd_reply":
      case "button_reply":
      case "cmd_replySender":
      case "cmd_replyGroup":
      case "button_followup":
      case "cmd_replyall":
      case "button_replyall":
      case "cmd_replylist":
      case "button_replylist":
      case "cmd_forward":
      case "button_forward":
      case "cmd_forwardInline":
      case "cmd_forwardAttachment":
      case "cmd_redirect":
      case "cmd_editAsNew":
      case "cmd_editDraftMsg":
      case "cmd_newMsgFromTemplate":
      case "cmd_editTemplateMsg":
      case "cmd_openMessage":
      case "button_print":
      case "cmd_viewPageSource":
      case "cmd_reload":
      case "cmd_applyFiltersToSelection":
        if (!CanComposeMessages()) {
          return false;
        }

        let numSelected = gFolderDisplay.selectedCount;
        if (command == "cmd_applyFiltersToSelection") {
          var whichText = "valueMessage";
          if (numSelected > 1) {
            whichText = "valueSelection";
          }
          goSetMenuValue(command, whichText);
          goSetAccessKey(command, whichText + "AccessKey");
        }
        if (numSelected > 0) {
          if (
            !gFolderDisplay.getCommandStatus(
              Ci.nsMsgViewCommandType.cmdRequiringMsgBody
            )
          ) {
            return false;
          }

          // Check if we have a collapsed thread selected and are summarizing it.
          // If so, selectedIndices.length won't match numSelected. Also check
          // that we're not displaying a message, which handles the case
          // where we failed to summarize the selection and fell back to
          // displaying a message.
          if (
            gFolderDisplay.selectedIndices.length != numSelected &&
            command != "cmd_applyFiltersToSelection" &&
            gDBView &&
            gDBView.currentlyDisplayedMessage == nsMsgViewIndex_None
          ) {
            return false;
          }
          if (
            command == "cmd_reply" ||
            command == "button_reply" ||
            command == "cmd_replyall" ||
            command == "button_replyall"
          ) {
            return IsReplyEnabled();
          }
          if (command == "cmd_replylist" || command == "button_replylist") {
            return IsReplyListEnabled();
          }
          return true;
        }
        return false;
      case "cmd_print":
        return gFolderDisplay.selectedCount >= 1;
      case "cmd_newMessage":
        return CanComposeMessages();
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
        return true;
      case "cmd_markAsFlagged":
      case "button_file":
        return gFolderDisplay.selectedCount > 0;
      case "cmd_archive":
      case "button_archive":
        return gFolderDisplay.canArchiveSelectedMessages;
      case "cmd_markAsJunk":
      case "cmd_markAsNotJunk":
        return gFolderDisplay.getCommandStatus(Ci.nsMsgViewCommandType.junk);
      case "cmd_recalculateJunkScore":
        // We're going to take a conservative position here, because we really
        // don't want people running junk controls on folders that are not
        // enabled for junk. The junk type picks up possible dummy message headers,
        // while the runJunkControls will prevent running on XF virtual folders.
        return (
          gFolderDisplay.getCommandStatus(Ci.nsMsgViewCommandType.junk) &&
          gFolderDisplay.getCommandStatus(
            Ci.nsMsgViewCommandType.runJunkControls
          )
        );
      case "cmd_displayMsgFilters":
        return MailServices.accounts.accounts.length > 0;
      case "cmd_applyFilters":
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.applyFilters
        );
      case "cmd_runJunkControls":
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.runJunkControls
        );
      case "cmd_deleteJunk":
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.deleteJunk
        );
      case "button_mark":
      case "cmd_tag":
      case "cmd_addTag":
      case "cmd_manageTags":
      case "cmd_removeTags":
      case "cmd_tag1":
      case "cmd_tag2":
      case "cmd_tag3":
      case "cmd_tag4":
      case "cmd_tag5":
      case "cmd_tag6":
      case "cmd_tag7":
      case "cmd_tag8":
      case "cmd_tag9":
      case "cmd_toggleRead":
        return gFolderDisplay.selectedCount > 0;
      case "cmd_markThreadAsRead":
        return gFolderDisplay.canMarkThreadAsRead;
      case "cmd_markAsRead":
        return CanMarkMsgAsRead(true);
      case "cmd_markAsUnread":
        return CanMarkMsgAsRead(false);
      case "button_nextMsg":
      case "cmd_nextMsg":
      case "button_next":
      case "cmd_nextUnreadMsg":
      case "cmd_nextUnreadThread":
      case "button_previousMsg":
      case "cmd_previousMsg":
      case "button_previous":
      case "cmd_previousUnreadMsg":
        return IsViewNavigationItemEnabled();
      case "button_goForward":
      case "button_goBack":
      case "cmd_goForward":
      case "cmd_goBack":
        if (gDBView) {
          return gDBView.navigateStatus(
            command == "cmd_goBack" || command == "button_goBack"
              ? Ci.nsMsgNavigationType.back
              : Ci.nsMsgNavigationType.forward
          );
        }
        return false;
      case "cmd_goStartPage":
        return (
          document.getElementById("tabmail").selectedTab.mode.name ==
            "folder" && !IsMessagePaneCollapsed()
        );
      case "cmd_undoCloseTab":
        return document.getElementById("tabmail").recentlyClosedTabs.length > 0;
      case "cmd_markAllRead":
        return (
          IsFolderSelected() &&
          gDBView &&
          gDBView.msgFolder &&
          gDBView.msgFolder.getNumUnread(false) > 0
        );
      case "cmd_markReadByDate":
        return IsFolderSelected();
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
        // If we are a message tab, then we've got a message displayed, so
        // always allow searching in the message
        if (
          document.getElementById("tabmail").selectedTab.mode.name == "message"
        ) {
          return true;
        }

        // Otherwise, only allow searching if we're showing the message pane.
        return !IsMessagePaneCollapsed();
      case "cmd_search":
        return MailServices.accounts.accounts.length > 0;
      case "cmd_selectAll":
      case "cmd_selectFlagged":
        return !!gDBView;
      // these are enabled on when we are in threaded mode
      case "cmd_selectThread":
        if (gFolderDisplay.selectedCount <= 0) {
          return false;
        }
      // Falls through
      case "cmd_expandAllThreads":
      case "cmd_collapseAllThreads":
        return (
          gFolderDisplay.view.showThreaded ||
          gFolderDisplay.view.showGroupedBySort
        );
      case "cmd_nextFlaggedMsg":
      case "cmd_previousFlaggedMsg":
        return IsViewNavigationItemEnabled();
      case "cmd_viewClassicMailLayout":
      case "cmd_viewWideMailLayout":
      case "cmd_viewVerticalMailLayout":
      case "cmd_toggleFolderPane":
      case "cmd_toggleFolderPaneCols":
      case "cmd_toggleMessagePane":
        // this is overridden per-mail tab
        return true;
      case "cmd_viewAllMsgs":
      case "cmd_viewIgnoredThreads":
        return gDBView;
      case "cmd_viewUnreadMsgs":
      case "cmd_viewThreadsWithUnread":
      case "cmd_viewWatchedThreadsWithUnread":
        return !gFolderDisplay.view.isVirtual;
      case "cmd_stop":
        return window.MsgStatusFeedback._meteorsSpinning;
      case "cmd_undo":
      case "cmd_redo":
        return SetupUndoRedoCommand(command);
      case "cmd_renameFolder": {
        let folders = gFolderTreeView.getSelectedFolders();
        return (
          folders.length == 1 &&
          folders[0].canRename &&
          folders[0].isCommandEnabled("cmd_renameFolder")
        );
      }
      case "cmd_sendUnsentMsgs":
        return IsSendUnsentMsgsEnabled(null);
      case "cmd_subscribe":
        return IsSubscribeEnabled();
      case "cmd_properties":
        return IsPropertiesEnabled(command);
      case "button_getNewMessages":
      case "cmd_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
        return IsGetNewMessagesEnabled();
      case "cmd_getNextNMessages":
        return IsGetNextNMessagesEnabled();
      case "cmd_emptyTrash": {
        let folder = GetSelectedMsgFolders()[0];
        return folder && folder.server.canEmptyTrashOnExit
          ? IsMailFolderSelected()
          : false;
      }
      case "button_compact": {
        let folders = gFolderTreeView.getSelectedFolders();
        let canCompact = function(folder) {
          return (
            !folder.isServer &&
            !folder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
            folder.server.canCompactFoldersOnServer &&
            folder.isCommandEnabled("button_compact")
          );
        };
        return folders && folders.every(canCompact);
      }
      case "cmd_compactFolder": {
        let folders = gFolderTreeView.getSelectedFolders();
        let canCompactAll = function(folder) {
          return (
            folder.server.canCompactFoldersOnServer &&
            folder.isCommandEnabled("cmd_compactFolder")
          );
        };
        return folders && folders.every(canCompactAll);
      }
      case "cmd_setFolderCharset":
        return IsFolderCharsetEnabled();
      case "cmd_downloadFlagged":
        return IsFolderSelected() && MailOfflineMgr.isOnline();
      case "cmd_downloadSelected":
        return (
          IsFolderSelected() &&
          MailOfflineMgr.isOnline() &&
          gFolderDisplay.selectedCount > 0
        );
      case "cmd_synchronizeOffline":
        return MailOfflineMgr.isOnline();
      case "cmd_settingsOffline":
        return IsAccountOfflineEnabled();
      case "cmd_moveToFolderAgain":
        // Disable "Move to <folder> Again" for news and other read only
        // folders since we can't really move messages from there - only copy.
        if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
          let loadedFolder = gFolderTreeView.getSelectedFolders()[0];
          if (loadedFolder && !loadedFolder.canDeleteMessages) {
            return false;
          }
        }
        let targetURI = Services.prefs.getCharPref(
          "mail.last_msg_movecopy_target_uri"
        );
        if (!targetURI) {
          return false;
        }
        let targetFolder = MailUtils.getExistingFolder(targetURI);
        // If null, folder doesn't exist.
        return targetFolder !== null && gFolderDisplay.selectedCount > 0;
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
        // If we are a message tab, then we've got a message displayed, so
        // always allow zooming in the message
        if (
          document.getElementById("tabmail").selectedTab.mode.name == "message"
        ) {
          return true;
        }
        return IsFolderSelected() && !IsMessagePaneCollapsed();
      case "cmd_fontSizeReduce":
        return UIFontSize.size > UIFontSize.MIN_VALUE;
      case "cmd_fontSizeEnlarge":
        return UIFontSize.size < UIFontSize.MAX_VALUE;
      case "cmd_fontSizeReset":
      case "cmd_chat":
        return true;
      case "cmd_newFolder":
      case "cmd_newVirtualFolder":
        return !!gFolderTreeController;
      case "cmd_goFolder":
        return !!gFolderTreeView;
      case "cmd_joinChat":
      case "cmd_addChatBuddy":
      case "cmd_chatStatus":
        return !!chatHandler;
    }
    return false;
  },

  doCommand(command, aTab) {
    // If the user invoked a key short cut then it is possible that we got here
    // for a command which is really disabled. Kick out if the command should be disabled.
    if (!this.isCommandEnabled(command)) {
      return;
    }

    switch (command) {
      case "button_getNewMessages":
      case "cmd_getNewMessages":
        MsgGetMessage();
        break;
      case "cmd_getMsgsForAuthAccounts":
        MsgGetMessagesForAllAuthenticatedAccounts();
        break;
      case "cmd_getNextNMessages":
        MsgGetNextNMessages();
        break;
      case "cmd_archive":
        MsgArchiveSelectedMessages(null);
        break;
      case "cmd_newMessage":
        MsgNewMessage(null);
        break;
      case "cmd_reply":
        MsgReplyMessage(null);
        break;
      case "cmd_replySender":
        MsgReplySender(null);
        break;
      case "cmd_replyGroup":
        MsgReplyGroup(null);
        break;
      case "cmd_replyall":
        MsgReplyToAllMessage(null);
        break;
      case "cmd_replylist":
        MsgReplyToListMessage(null);
        break;
      case "cmd_forward":
        MsgForwardMessage(null);
        break;
      case "cmd_forwardInline":
        MsgForwardAsInline(null);
        break;
      case "cmd_forwardAttachment":
        MsgForwardAsAttachment(null);
        break;
      case "cmd_redirect":
        MsgRedirectMessage(null);
        break;
      case "cmd_editAsNew":
        MsgEditMessageAsNew(null);
        break;
      case "cmd_editDraftMsg":
        MsgEditDraftMessage(null);
        break;
      case "cmd_newMsgFromTemplate":
        MsgNewMessageFromTemplate(null);
        break;
      case "cmd_editTemplateMsg":
        MsgEditTemplateMessage(null);
        break;
      case "cmd_createFilterFromMenu":
        MsgCreateFilter();
        break;
      case "cmd_createFilterFromPopup":
        break; // This does nothing because the createfilter is invoked from the popupnode oncommand.
      case "button_delete":
      case "cmd_delete":
        // if the user deletes a message before its mark as read timer goes off, we should mark it as read
        // this ensures that we clear the biff indicator from the system tray when the user deletes the new message
        MarkSelectedMessagesRead(true);
        // If this is a right-click triggered delete, then do not hint about
        //  the deletion.  Note: The code that swaps the selection back in will
        //  take care of ensuring that this deletion does not make the saved
        //  selection incorrect.
        if (!gRightMouseButtonSavedSelection) {
          gFolderDisplay.hintAboutToDeleteMessages();
        }
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
        UpdateDeleteToolbarButton();
        break;
      case "cmd_cancel":
        let message = gFolderDisplay.selectedMessage;
        message.folder
          .QueryInterface(Ci.nsIMsgNewsFolder)
          .cancelMessage(message, msgWindow);
        break;
      case "button_shiftDelete":
      case "cmd_shiftDelete":
        MarkSelectedMessagesRead(true);
        gFolderDisplay.hintAboutToDeleteMessages();
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.deleteNoTrash);
        UpdateDeleteToolbarButton();
        break;
      case "cmd_deleteFolder":
        gFolderTreeController.deleteFolder();
        break;
      case "cmd_killThread":
        if (!gFolderDisplay.selectedMessageIsNews) {
          if (!gFolderDisplay.selectedMessageThreadIgnored) {
            ShowIgnoredMessageNotification(
              gFolderDisplay.selectedMessages,
              false
            );
          } else {
            FolderPaneController.notificationBox.removeTransientNotifications();
          }
        }
        // kill thread kills the thread and then does a next unread
        GoNextMessage(Ci.nsMsgNavigationType.toggleThreadKilled, true);
        break;
      case "cmd_killSubthread":
        if (!gFolderDisplay.selectedMessageIsNews) {
          if (!gFolderDisplay.selectedMessageSubthreadIgnored) {
            ShowIgnoredMessageNotification(
              gFolderDisplay.selectedMessages,
              true
            );
          } else {
            FolderPaneController.notificationBox.removeTransientNotifications();
          }
        }
        GoNextMessage(Ci.nsMsgNavigationType.toggleSubthreadKilled, true);
        break;
      case "cmd_watchThread":
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.toggleThreadWatched);
        break;
      case "button_next":
      case "cmd_nextUnreadMsg":
        GoNextMessage(Ci.nsMsgNavigationType.nextUnreadMessage, true);
        break;
      case "cmd_nextUnreadThread":
        GoNextMessage(Ci.nsMsgNavigationType.nextUnreadThread, true);
        break;
      case "button_nextMsg":
      case "cmd_nextMsg":
        GoNextMessage(Ci.nsMsgNavigationType.nextMessage, false);
        break;
      case "cmd_nextFlaggedMsg":
        GoNextMessage(Ci.nsMsgNavigationType.nextFlagged, true);
        break;
      case "button_previousMsg":
      case "cmd_previousMsg":
        GoNextMessage(Ci.nsMsgNavigationType.previousMessage, false);
        break;
      case "button_previous":
      case "cmd_previousUnreadMsg":
        GoNextMessage(Ci.nsMsgNavigationType.previousUnreadMessage, true);
        break;
      case "cmd_previousFlaggedMsg":
        GoNextMessage(Ci.nsMsgNavigationType.previousFlagged, true);
        break;
      case "button_goForward":
      case "cmd_goForward":
        GoNextMessage(Ci.nsMsgNavigationType.forward, true);
        break;
      case "button_goBack":
      case "cmd_goBack":
        GoNextMessage(Ci.nsMsgNavigationType.back, true);
        break;
      case "cmd_goStartPage":
        HideMessageHeaderPane();
        loadStartPage(true);
        break;
      case "cmd_undoCloseTab":
        document.getElementById("tabmail").undoCloseTab();
        break;
      case "cmd_viewClassicMailLayout":
      case "cmd_viewWideMailLayout":
      case "cmd_viewVerticalMailLayout":
        ChangeMailLayoutForCommand(command);
        break;
      case "cmd_toggleFolderPane":
        MsgToggleFolderPane();
        break;
      case "cmd_toggleFolderPaneCols":
        gFolderTreeView.toggleCols();
        break;
      case "cmd_toggleMessagePane":
        MsgToggleMessagePane();
        break;
      case "cmd_viewAllMsgs":
      case "cmd_viewThreadsWithUnread":
      case "cmd_viewWatchedThreadsWithUnread":
      case "cmd_viewUnreadMsgs":
      case "cmd_viewIgnoredThreads":
        SwitchView(command);
        break;
      case "cmd_undo":
        messenger.undo(msgWindow);
        break;
      case "cmd_redo":
        messenger.redo(msgWindow);
        break;
      case "cmd_expandAllThreads":
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.expandAll);
        gFolderDisplay.ensureSelectionIsVisible();
        break;
      case "cmd_collapseAllThreads":
        gFolderDisplay.selectSelectedThreadRoots();
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.collapseAll);
        gFolderDisplay.ensureSelectionIsVisible();
        break;
      case "cmd_renameFolder":
        gFolderTreeController.renameFolder();
        return;
      case "cmd_sendUnsentMsgs":
        // if offline, prompt for sendUnsentMessages
        if (MailOfflineMgr.isOnline()) {
          SendUnsentMessages();
        } else {
          MailOfflineMgr.goOnlineToSendMessages(msgWindow);
        }
        return;
      case "cmd_subscribe":
        MsgSubscribe();
        return;
      case "cmd_openMessage":
        MsgOpenSelectedMessages();
        return;
      case "cmd_openConversation":
      case "button_showconversation":
        new ConversationOpener(window).openConversationForMessages(
          gFolderDisplay.selectedMessages
        );
        return;
      case "cmd_print":
        PrintSelectedMessages();
        return;
      case "cmd_saveAsFile":
        MsgSaveAsFile();
        return;
      case "cmd_saveAsTemplate":
        MsgSaveAsTemplate();
        return;
      case "cmd_viewPageSource":
        ViewPageSource(gFolderDisplay.selectedMessageUris);
        return;
      case "cmd_setFolderCharset":
        gFolderTreeController.editFolder();
        return;
      case "cmd_reload":
        ReloadMessage();
        return;
      case "cmd_find":
        // Make sure the message pane has focus before we start a find since we
        // only support searching within the message body.
        SetFocusMessagePane();
        document.getElementById("FindToolbar").onFindCommand();
        return;
      case "cmd_findAgain":
        // Make sure the message pane has focus before we start a find since we
        // only support searching within the message body.
        SetFocusMessagePane();
        document.getElementById("FindToolbar").onFindAgainCommand(false);
        return;
      case "cmd_findPrevious":
        // Make sure the message pane has focus before we start a find since we
        // only support searching within the message body.
        SetFocusMessagePane();
        document.getElementById("FindToolbar").onFindAgainCommand(true);
        return;
      case "cmd_markReadByDate":
        MsgMarkReadByDate();
        return;
      case "cmd_properties":
        gFolderTreeController.editFolder();
        return;
      case "cmd_search":
        MsgSearchMessages();
        return;
      case "cmd_addTag":
        AddTag();
        return;
      case "cmd_manageTags":
        ManageTags();
        return;
      case "cmd_removeTags":
        RemoveAllMessageTags();
        return;
      case "cmd_tag1":
      case "cmd_tag2":
      case "cmd_tag3":
      case "cmd_tag4":
      case "cmd_tag5":
      case "cmd_tag6":
      case "cmd_tag7":
      case "cmd_tag8":
      case "cmd_tag9":
        var tagNumber = parseInt(command[7]);
        ToggleMessageTagKey(tagNumber);
        return;
      case "button_mark":
      case "cmd_toggleRead":
        MsgMarkMsgAsRead();
        return;
      case "cmd_markAsRead":
        MsgMarkMsgAsRead(true);
        return;
      case "cmd_markAsUnread":
        MsgMarkMsgAsRead(false);
        return;
      case "cmd_markThreadAsRead":
        ClearPendingReadTimer();
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.markThreadRead);
        return;
      case "cmd_markAllRead":
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.markAllRead);
        return;
      case "button_junk":
        MsgJunk();
        return;
      case "cmd_stop":
        msgWindow.StopUrls();
        return;
      case "cmd_markAsFlagged":
        MsgMarkAsFlagged();
        return;
      case "cmd_viewAllHeader":
        MsgViewAllHeaders();
        return;
      case "cmd_viewNormalHeader":
        MsgViewNormalHeaders();
        return;
      case "cmd_markAsJunk":
        JunkSelectedMessages(true);
        return;
      case "cmd_markAsNotJunk":
        JunkSelectedMessages(false);
        return;
      case "cmd_recalculateJunkScore":
        analyzeMessagesForJunk();
        return;
      case "cmd_displayMsgFilters":
        MsgFilters(null, null);
        return;
      case "cmd_applyFiltersToSelection":
        MsgApplyFiltersToSelection();
        return;
      case "cmd_applyFilters":
        MsgApplyFilters(null);
        return;
      case "cmd_runJunkControls":
        filterFolderForJunk();
        return;
      case "cmd_deleteJunk":
        // Even though deleteJunkInFolder returns a value, we don't want to let
        // it get past us
        deleteJunkInFolder();
        return;
      case "cmd_emptyTrash":
        gFolderTreeController.emptyTrash();
        return;
      case "cmd_compactFolder":
        gFolderTreeController.compactAllFoldersForAccount();
        return;
      case "button_compact":
        gFolderTreeController.compactFolders();
        return;
      case "cmd_downloadFlagged":
        gFolderDisplay.doCommand(
          Ci.nsMsgViewCommandType.downloadFlaggedForOffline
        );
        break;
      case "cmd_downloadSelected":
        gFolderDisplay.doCommand(
          Ci.nsMsgViewCommandType.downloadSelectedForOffline
        );
        break;
      case "cmd_synchronizeOffline":
        MsgSynchronizeOffline();
        break;
      case "cmd_settingsOffline":
        MailOfflineMgr.openOfflineAccountSettings();
        break;
      case "cmd_moveToFolderAgain":
        var folder = MailUtils.getOrCreateFolder(
          Services.prefs.getCharPref("mail.last_msg_movecopy_target_uri")
        );
        if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
          MsgMoveMessage(folder);
        } else {
          MsgCopyMessage(folder);
        }
        break;
      case "cmd_selectAll":
        // XXX If the message pane is selected but the tab focused, this ends
        // closing the message tab. See bug 502834.
        if (aTab.mode.name == "message") {
          break;
        }

        // move the focus so the user can delete the newly selected messages, not the folder
        SetFocusThreadPane();
        // if in threaded mode, the view will expand all before selecting all
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.selectAll);
        break;
      case "cmd_selectThread":
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.selectThread);
        break;
      case "cmd_selectFlagged":
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.selectFlagged);
        break;
      case "cmd_fullZoomReduce":
        ZoomManager.reduce();
        break;
      case "cmd_fullZoomEnlarge":
        ZoomManager.enlarge();
        break;
      case "cmd_fullZoomReset":
        ZoomManager.reset();
        break;
      case "cmd_fullZoomToggle":
        ZoomManager.toggleZoom();
        break;
      case "cmd_fontSizeReduce":
        UIFontSize.reduceSize();
        break;
      case "cmd_fontSizeReset":
        UIFontSize.resetSize();
        break;
      case "cmd_fontSizeEnlarge":
        UIFontSize.increaseSize();
        break;
      case "cmd_chat":
        showChatTab();
        break;
      case "cmd_newFolder":
        gFolderTreeController.newFolder();
        break;
      case "cmd_newVirtualFolder":
        gFolderTreeController.newVirtualFolder();
        break;
    }
  },
  /* eslint-enable complexity */

  onEvent(event) {
    // on blur events set the menu item texts back to the normal values
    if (event == "blur") {
      goSetMenuValue("cmd_undo", "valueDefault");
      goSetMenuValue("cmd_redo", "valueDefault");
    }
  },
};

/**
 * Show a notification in the message pane footer, allowing the user to learn
 * more about the ignore thread feature, and also allowing undo ignore thread.
 * @param aMsgs the messages that were ignore
 * @param aSubThread only boolean indicating if it was ignore subthread or
 *                   ignore thread
 */
function ShowIgnoredMessageNotification(aMsgs, aSubthreadOnly) {
  let notifyBox = FolderPaneController.notificationBox;
  notifyBox.removeTransientNotifications(); // don't want to pile these up

  let bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );

  let buttons = [
    {
      label: bundle.GetStringFromName("learnMoreAboutIgnoreThread"),
      accessKey: bundle.GetStringFromName(
        "learnMoreAboutIgnoreThreadAccessKey"
      ),
      popup: null,
      callback(aNotificationBar, aButton) {
        let url = Services.prefs.getCharPref(
          "mail.ignore_thread.learn_more_url"
        );
        openContentTab(url);
        return true; // keep notification open
      },
    },
    {
      label: bundle.GetStringFromName(
        !aSubthreadOnly ? "undoIgnoreThread" : "undoIgnoreSubthread"
      ),
      accessKey: bundle.GetStringFromName(
        !aSubthreadOnly
          ? "undoIgnoreThreadAccessKey"
          : "undoIgnoreSubthreadAccessKey"
      ),
      isDefault: true,
      popup: null,
      callback(aNotificationBar, aButton) {
        aMsgs.forEach(function(msg) {
          let msgDb = msg.folder.msgDatabase;
          if (aSubthreadOnly) {
            msgDb.MarkHeaderKilled(msg, false, gDBView);
          } else {
            let thread = msgDb.GetThreadContainingMsgHdr(msg);
            msgDb.MarkThreadIgnored(thread, thread.threadKey, false, gDBView);
          }
        });
        return false; // close notification
      },
    },
  ];

  let threadIds = new Set();
  aMsgs.forEach(function(msg) {
    if (!threadIds.has(msg.threadId)) {
      threadIds.add(msg.threadId);
    }
  });
  let nbrOfThreads = threadIds.size;

  if (nbrOfThreads == 1) {
    let ignoredThreadText = bundle.GetStringFromName(
      !aSubthreadOnly ? "ignoredThreadFeedback" : "ignoredSubthreadFeedback"
    );
    let subj = aMsgs[0].mime2DecodedSubject || "";
    if (subj.length > 45) {
      subj = subj.substring(0, 45) + "…";
    }
    let text = ignoredThreadText.replace("#1", subj);

    notifyBox.appendNotification(
      "ignoreThreadInfo",
      {
        label: text,
        priority: notifyBox.PRIORITY_INFO_MEDIUM,
      },
      null,
      buttons
    );
  } else {
    let ignoredThreadText = bundle.GetStringFromName(
      !aSubthreadOnly ? "ignoredThreadsFeedback" : "ignoredSubthreadsFeedback"
    );
    let text = PluralForm.get(nbrOfThreads, ignoredThreadText).replace(
      "#1",
      nbrOfThreads
    );
    notifyBox.appendNotification(
      "ignoreThreadsInfo",
      {
        label: text,
        priority: notifyBox.PRIORITY_INFO_MEDIUM,
      },
      buttons
    );
  }
}

function CloseTabOrWindow() {
  let tabmail = document.getElementById("tabmail");
  if (tabmail.tabInfo.length == 1) {
    if (Services.prefs.getBoolPref("mail.tabs.closeWindowWithLastTab")) {
      window.close();
    }
  } else {
    tabmail.removeCurrentTab();
  }
}

function GetNumSelectedMessages() {
  // This global function is only for mailnews/ compatibility.
  return gFolderDisplay.selectedCount;
}

var gLastFocusedElement = null;

function FocusRingUpdate_Mail() {
  if (!gFolderDisplay) {
    return;
  }

  // if the focusedElement is null, we're here on a blur.
  // nsFocusController::Blur() calls nsFocusController::SetFocusedElement(null),
  // which will update any commands listening for "focus".
  // we really only care about nsFocusController::Focus() happens,
  // which calls nsFocusController::SetFocusedElement(element)
  var currentFocusedElement = gFolderDisplay.focusedPane;

  if (currentFocusedElement != gLastFocusedElement) {
    if (currentFocusedElement) {
      currentFocusedElement.setAttribute("focusring", "true");
    }

    if (gLastFocusedElement) {
      gLastFocusedElement.removeAttribute("focusring");
    }

    gLastFocusedElement = currentFocusedElement;

    // since we just changed the pane with focus we need to update the toolbar to reflect this
    // XXX TODO
    // can we optimize
    // and just update cmd_delete and button_delete?
    UpdateMailToolbar("focus");
  }
}

function RestoreFocusAfterHdrButton() {
  // Note: Some callers call this function *after* asynchronous functions like
  // save-as which will trigger a save dialog. As those dialogs are typically
  // slower to load, in reality this function may set focus on thread pane
  // *before* the dialog is shown on screen. This does not seem to cause
  // problems like dialogs being hidden behind the main window, probably because
  // they're application-modal OS dialogs and will ensure having focus anyway.
  //
  // I would love to really restore the focus to the pane that had
  // focus before the user clicked on the hdr button, and gLastFocusedElement
  // would almost do that, except that clicking on the hdr button sets
  // gLastFocusedElement to the message pane. What I need is
  // gPenultimateFocusedElement.
  SetFocusThreadPane();
}

function SetupCommandUpdateHandlers() {
  // folder pane
  var widget = document.getElementById("folderTree");
  if (widget) {
    widget.controllers.appendController(FolderPaneController);
  }
}

function UnloadCommandUpdateHandlers() {}

function IsSendUnsentMsgsEnabled(unsentMsgsFolder) {
  // If no account has been configured, there are no messages for sending.
  if (MailServices.accounts.accounts.length == 0) {
    return false;
  }

  var msgSendlater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
    Ci.nsIMsgSendLater
  );

  // If we're currently sending unsent msgs, disable this cmd.
  if (msgSendlater.sendingMessages) {
    return false;
  }

  if (unsentMsgsFolder) {
    // If unsentMsgsFolder is non-null, it is the "Unsent Messages" folder.
    // We're here because we've done a right click on the "Unsent Messages"
    // folder (context menu), so we can use the folder and return true/false
    // straight away.
    return unsentMsgsFolder.getTotalMessages(false) > 0;
  }

  // Otherwise, we don't know where we are, so use the current identity and
  // find out if we have messages or not via that.
  let identity;
  let folders = GetSelectedMsgFolders();
  if (folders.length > 0) {
    [identity] = MailUtils.getIdentityForServer(folders[0].server);
  }

  if (!identity) {
    let defaultAccount = MailServices.accounts.defaultAccount;
    if (defaultAccount) {
      identity = defaultAccount.defaultIdentity;
    }

    if (!identity) {
      return false;
    }
  }

  return msgSendlater.hasUnsentMessages(identity);
}

/**
 * Determine whether there exists any server for which to show the Subscribe dialog.
 */
function IsSubscribeEnabled() {
  // If there are any IMAP or News servers, we can show the dialog any time and
  // it will properly show those.
  for (let server of MailServices.accounts.allServers) {
    if (server.type == "imap" || server.type == "nntp") {
      return true;
    }
  }

  // RSS accounts use a separate Subscribe dialog that we can only show when
  // such an account is selected.
  let preselectedFolder = GetFirstSelectedMsgFolder();
  if (preselectedFolder && preselectedFolder.server.type == "rss") {
    return true;
  }

  return false;
}

function IsFolderCharsetEnabled() {
  return IsFolderSelected();
}

function IsPropertiesEnabled(command) {
  var folders = GetSelectedMsgFolders();
  if (!folders.length) {
    return false;
  }
  var folder = folders[0];

  // when servers are selected it should be "Edit | Properties..."
  if (folder.isServer) {
    goSetMenuValue(command, "valueGeneric");
  } else if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    goSetMenuValue(command, "valueFolder");
  } else {
    goSetMenuValue(
      command,
      isNewsURI(folder.URI) ? "valueNewsgroup" : "valueFolder"
    );
  }

  return folders.length == 1;
}

function IsViewNavigationItemEnabled() {
  return IsFolderSelected();
}

function IsFolderSelected() {
  var folders = GetSelectedMsgFolders();
  return folders.length == 1 && !folders[0].isServer;
}

function SetFocusThreadPaneIfNotOnMessagePane() {
  var focusedElement = gFolderDisplay.focusedPane;

  if (focusedElement != GetThreadTree() && focusedElement != GetMessagePane()) {
    SetFocusThreadPane();
  }
}

// 3pane related commands.  Need to go in own file.  Putting here for the moment.

/**
 * Cycle through the various panes in the 3pane window.
 *
 * @param {Event} event - The keypress DOMEvent.
 */
function SwitchPaneFocus(event) {
  // First, build an array of panes to cycle through based on our current state.
  // This will usually be something like [threadPane, messagePane, folderPane].
  let panes = [];
  let focusedElement;
  let spacesElement = !gSpacesToolbar.isHidden
    ? gSpacesToolbar.focusButton
    : document.getElementById("spacesPinnedButton");

  let { currentTabInfo } = document.getElementById("tabmail");
  if (currentTabInfo.mode.name == "mail3PaneTab") {
    let { browser, folderPaneVisible, messagePaneVisible } = currentTabInfo;
    let {
      document: contentDocument,
      folderTree,
      threadTree,
      webBrowser,
      messageBrowser,
      multiMessageBrowser,
      accountCentralBrowser,
    } = browser.contentWindow;

    panes.push(spacesElement);

    if (folderPaneVisible) {
      panes.push(folderTree);
    }

    if (accountCentralBrowser.hidden) {
      panes.push(threadTree);
    } else {
      panes.push(accountCentralBrowser);
    }

    if (messagePaneVisible) {
      for (let browser of [webBrowser, messageBrowser, multiMessageBrowser]) {
        if (!browser.hidden) {
          panes.push(browser);
        }
      }
    }

    focusedElement = contentDocument.activeElement;
  } else if (currentTabInfo.mode.tabType.name == "mail") {
    panes.push(spacesElement);

    if (gFolderDisplay.folderPaneVisible) {
      panes.push(document.getElementById("folderTree"));
    }

    panes.push(GetThreadTree());

    if (!IsMessagePaneCollapsed()) {
      panes.push(GetMessagePane());
    }

    focusedElement = gFolderDisplay.focusedPane;
  } else {
    return;
  }

  // Find our focused element in the array. If focus is not on one of the main
  // panes (it's probably on the toolbar), then act as if it's on the thread
  // tree.
  let focusedElementIndex = panes.indexOf(focusedElement);
  if (focusedElementIndex == -1) {
    focusedElementIndex = 0;
  }

  if (event.shiftKey) {
    focusedElementIndex--;
    if (focusedElementIndex == -1) {
      focusedElementIndex = panes.length - 1;
    }
  } else {
    focusedElementIndex++;
    if (focusedElementIndex == panes.length) {
      focusedElementIndex = 0;
    }
  }

  let newElem = panes[focusedElementIndex];

  // We need to handle the message pane specially, since focusing it isn't as
  // simple as just calling focus(). See SetFocusMessagePane below for more
  // details.
  if (newElem == GetMessagePane()) {
    SetFocusMessagePane();
  } else {
    newElem.focus();
  }
}

function SetFocusThreadPane() {
  GetThreadTree()?.focus();
}

/**
 * Set the focus to the currently-active message pane (either the single- or
 * multi-message).
 */
function SetFocusMessagePane() {
  // Calling .focus() on content doesn't blur the previously focused chrome
  // element, so we shift focus to the XUL pane first, to not leave another
  // pane looking like it has focus.
  GetMessagePane().focus();
  if (gMessageDisplay.singleMessageDisplay) {
    getMessagePaneBrowser().focus();
  } else {
    document.getElementById("multimessage").focus();
  }
}

/** Check if this is a folder the user is allowed to delete. */
function CanDeleteFolder(folder) {
  if (folder.isServer) {
    return false;
  }

  var specialFolder = FolderUtils.getSpecialFolderString(folder);

  if (
    specialFolder == "Inbox" ||
    specialFolder == "Trash" ||
    specialFolder == "Drafts" ||
    specialFolder == "Sent" ||
    specialFolder == "Templates" ||
    specialFolder == "Outbox" ||
    (specialFolder == "Junk" &&
      !FolderUtils.canRenameDeleteJunkMail(folder.URI))
  ) {
    return false;
  }

  return true;
}

/** Prints the messages selected in the thread pane. */
async function PrintSelectedMessages() {
  if (gFolderDisplay.selectedCount == 1) {
    if (
      gMessageDisplay.visible &&
      gFolderDisplay.selectedMessage == gMessageDisplay.displayedMessage
    ) {
      // Use the already displayed message and print preview UI if we can.
      let messagePaneBrowser = document.getElementById("messagepane");
      PrintUtils.startPrintWindow(messagePaneBrowser.browsingContext, {});
    } else {
      // Load the only message in a hidden browser, then use the print preview UI.
      let uri = gFolderDisplay.selectedMessageUris[0];
      let messageService = messenger.messageServiceFromURI(uri);
      await PrintUtils.loadPrintBrowser(messageService.getUrlForUri(uri).spec);
      PrintUtils.startPrintWindow(PrintUtils.printBrowser.browsingContext, {});
    }

    return;
  }

  // Multiple messages. Get the printer settings, then load the messages into
  // a hidden browser and print them one at a time.
  let ps = PrintUtils.getPrintSettings();
  Cc["@mozilla.org/widget/printdialog-service;1"]
    .getService(Ci.nsIPrintDialogService)
    .showPrintDialog(window, false, ps);
  if (ps.isCancelled) {
    return;
  }
  ps.printSilent = true;

  for (let uri of gFolderDisplay.selectedMessageUris) {
    let messageService = messenger.messageServiceFromURI(uri);
    await PrintUtils.loadPrintBrowser(messageService.getUrlForUri(uri).spec);
    await PrintUtils.printBrowser.browsingContext.print(ps);
  }
}
