﻿// cd /d D:\USB\cgi-bin\program\wiki && node archive_logs.js
// cd ~/wikibot && date && time ../node/bin/node archive_logs.js
// archive logs. 若紀錄超過1筆，而且長度過長，那麼就將所有的記錄搬到存檔中。

/*

 2016/3/23 17:13:10	初版試營運。

 */

'use strict';

require('./wiki loder.js');
// for CeL.wiki.cache(), CeL.fs_mkdir()
CeL.run('application.platform.nodejs');

var
/** {Object}wiki 操作子. */
wiki = Wiki(true),
/** {String}base directory */
base_directory = bot_directory + script_name + '/';

// ---------------------------------------------------------------------//

var
/** {String}只檢查這個命名空間下面的所有頁面。 20: for 20dd年 */
title_prefix = 'User:' + user_name + '/log/20',
/**
 * log_root (所有個別項目之記錄頁面) 的模式。其下視為子頁面，其上不被視作記錄頁面。
 * 
 * matched: [ all title, user, date ]
 * 
 * @type {RegExp}
 */
PATTERN_LOG_TITLE = /^User:([^:\/]+)\/log\/(\d{8})$/,
/** {String|RegExp}將移除此標記 後第一個章節開始所有的內容。 */
last_preserve_mark = '運作記錄',
/** {Natural}若是超過了這個長度則將會被搬移。 */
min_length = 500,
// {Boolean|String} e.g., '20160101'
create_first = '20160401',
/** {Natural}記錄頁面的存檔起始編號。 */
archive_index_starts = 1,
// lastest_archive[title] = last index of archive
lastest_archive = CeL.null_Object(),
// archive prefix
archive_prefix = '存檔|存档|Archive',
// 將第一個 archive_prefix 作為預設 archive_prefix。
default_archive_prefix = archive_prefix.replace(/\|.+$/, ''),
// archive_prefix_hash[title] = archive prefix of log page
archive_prefix_hash = CeL.null_Object(),
// [ all, log root, archive prefix, archive index ]
PATTERN_log_archive = new RegExp('^(.+?\/[^\/]+)\/(' + archive_prefix
		+ ')(\\d+)$'),

/** {Number}未發現之index。 const: 基本上與程式碼設計合一，僅表示名義，不可更改。(=== -1) */
NOT_FOUND = ''.indexOf('_');

function archive_title(log_title, archive_index) {
	// 須配合 PATTERN_log_archive。
	return log_title
			+ '/'
			+ (archive_prefix_hash[log_title] || default_archive_prefix)
			+ (archive_index || lastest_archive[log_title] || archive_index_starts);
}

/**
 * get log pages.
 * 
 * @param {Function}callback
 *            回調函數。 callback(titles)
 */
function get_log_pages(callback) {
	wiki.prefixsearch(title_prefix, function(title, titles, pages) {
		CeL.log('get_log_pages: ' + titles.length + ' sub pages.');
		// console.log(titles);
		callback(titles.sort());
	}, {
		limit : 'max'
	});
}

/**
 * 處理每一個記錄頁面。
 * 
 * @param {Object}page_data
 *            log page data
 */
function for_log_page(page_data) {
	/** {String}page title */
	var log_title = CeL.wiki.title_of(page_data),
	/** {String}page content, maybe undefined. */
	content = CeL.wiki.content_of(page_data);

	CeL.log('for_log_page: 處理 [[' + log_title + ']]');

	var matched = content && content.match(last_preserve_mark);
	if (!matched) {
		CeL.warn('for_log_page: Invalid log page? (未發現紀錄標記) [[' + log_title
				+ ']]');
		return;
	}

	/** {RegExp}章節標題。 */
	var PATTERN_TITLE = /\n=[^\n]+=\n/g,
	/** {Number}要搬移的紀錄大小 */
	log_size = content.length - matched.index, needless_reason;

	PATTERN_TITLE.lastIndex = matched.index + matched[0].length;
	// console.log(PATTERN_TITLE.lastIndex + '/' + content.length);
	matched = PATTERN_TITLE.exec(content);

	if (!matched) {
		needless_reason = '未發現紀錄章節標題';
		// console.log(content);
		// console.log(PATTERN_TITLE);
	} else if (log_size < min_length)
		needless_reason = '頁面紀錄過短 (' + log_size + ' bytes)';
	else if (content.indexOf('\n==', matched.index + matched[0].length) === NOT_FOUND)
		needless_reason = '僅有1筆紀錄';
	else if (!(log_title in lastest_archive)) {
		if (!create_first)
			needless_reason = true;
		else if (log_title.replace(/^.+?(\d+)$/, '$1') <= create_first)
			needless_reason = create_first + '之前的紀錄';
		if (needless_reason)
			needless_reason = '原先不存在存檔子頁面，且已設定' + (needless_reason || '')
					+ '不造出存檔子頁面(若需要自動存檔，您需要自己創建首個存檔子頁面)';
	}

	if (needless_reason) {
		CeL.info('for_log_page: ' + needless_reason + '；不作存檔: [[' + log_title
				+ ']]');
		return;
	}

	// --------------------------------

	/** {Boolean}已經發生過錯誤 */
	var had_failed,
	/** {String}編輯摘要。總結報告。 */
	summary;

	/** 寫入記錄頁面 */
	function write_log_page() {
		wiki.page(log_title).edit(function(page_data) {
			return content.slice(0, matched.index);
		}, {
			summary : summary + ' #2/2 remove log',
			nocreate : had_failed ? 0 : 1
		}, function(title, error) {
			if (error)
				CeL.err('write_log_page: 無法寫入記錄頁面 [['
				//
				+ log_title + ']]! 您需要自行刪除舊紀錄!');
		});
	}

	/** 寫入記錄頁面的存檔 */
	function write_archive() {
		var archive_page = archive_title(log_title), config = {
			summary : summary + ' #1/2 append log',
			section : 'new',
			sectiontitle : (new Date).format('%4Y%2m%2d') + '存檔'
		};
		summary = '存檔作業: [[' + log_title + ']] → [[' + archive_page + ']] '
				+ log_size + ' bytes';
		CeL.info('for_log_page: ' + summary);

		if (!had_failed && (log_title in lastest_archive))
			config.nocreate = 1;

		wiki.page(archive_page).edit(function(page_data) {
			if (CeL.is_debug(3)) {
				console.log('** Edit:');
				console.log(page_data);
			}
			var
			/** {String}page content, maybe undefined. */
			log_page = CeL.wiki.content_of(page_data);

			if (had_failed || log_page &&
			// 頁面大小系統上限 2,048 KB = 2 MB。
			log_page.length + log_size < 2e6)
				return '存檔長度' + log_size + '字元。\n\n'
				//
				+ content.slice(matched.index);
		}, config, function(title, error) {
			if (!error)
				write_log_page();
			else if (had_failed) {
				CeL.err('write_archive: 無法寫入存檔 [[' + archive_page + ']]!');
				console.error(error);
			} else {
				if (log_title in lastest_archive)
					lastest_archive[log_title]++;
				else {
					CeL.err('write_archive: 創建存檔頁面 [['
					//
					+ archive_page + ']] 失敗，不再作嘗試。');
					console.error(error);
					return;

					lastest_archive[log_title]
					//
					= archive_index_starts + 1;
				}
				had_failed = true;
				CeL.debug('write_archive: 嘗試存到下一個編號: '
				//
				+ lastest_archive[log_title] + '。');
				// retry again.
				write_archive();
			}
		});
	}

	write_archive();
}

get_log_pages(function(log_pages) {
	var
	/** {Array}filter log root. e.g., [[User:user_name/log/20010101]] */
	log_root = log_pages.filter(function(title) {
		if (!title.includes('20150916'))
			return;
		// 篩選出存檔頁面
		var matched = title.match(PATTERN_log_archive);
		if (matched) {
			// console.log(matched);
			var index = matched[3] | 0;
			if (matched[1] in lastest_archive) {
				if (archive_prefix_hash[matched[1]] !== matched[2]) {
					CeL.warn('[[' + matched[1] + ']] 的存檔頁面有兩種不同的 prefix: '
							+ archive_prefix_hash[matched[1]] + ', '
							+ matched[2] + '。將以數字最大者為主。');
				}
				if (index < lastest_archive[matched[1]])
					// 不作設定。
					index = null;
			}
			if (index) {
				// 設定 index
				// 中間即使有空的編號，也會跳號不考慮。
				lastest_archive[matched[1]] = index;
				archive_prefix_hash[matched[1]] = matched[2];
			}
		}
		return PATTERN_LOG_TITLE.test(title);
	});
	// console.log(log_root);
	// console.log(lastest_archive);
	// console.log(archive_prefix_hash);

	wiki.page(log_root, function(pages, error) {
		if (error)
			CeL.err(error);
		else
			pages.forEach(for_log_page);
	}, {
		multi : true
	});
});