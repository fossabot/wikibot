﻿// cd ~/wikibot && date && time /shared/bin/node 20160414.import_link_to_Wikidata_label.js && date

/*

 初版試營運，約耗時 12分鐘執行。

 */

'use strict';

require('./wiki loder.js');
// for CeL.wiki.cache(), CeL.fs_mkdir()
CeL.run('application.platform.nodejs');

var
/** {Object}wiki operator 操作子. */
wiki = Wiki(true),
/** {String}base directory */
base_directory = bot_directory + script_name + '/';

var
/** {Natural}所欲紀錄的最大筆數。 */
log_limit = 4000;

// ----------------------------------------------------------------------------

wiki.set_data();

var count = 0,
// label_hash['language:title'] = {String}label || {Array}labels
label_hash = CeL.null_Object(), source_hash = CeL.null_Object(),
// [ all link, foreign language, title in foreign language, local label ]
PATTERN_link = /\[\[:\s*?([a-z]{2,})\s*:\s*([^\[\]\|]+)\|([^\[\]\|]+)\]\]/g,
//
PATTERN_en = /^[a-z,.;\-\d\s]+$/i;

/**
 * Operation for each page. 對每一個頁面都要執行的作業。
 * 
 * @param {Object}page_data
 *            page data got from wiki API. =
 *            {pageid,ns,title,revisions:[{timestamp,'*'}]}
 */
function for_each_page(page_data) {
	/** {String}page title = page_data.title */
	var title = CeL.wiki.title_of(page_data),
	/** {String}page content, maybe undefined. 頁面內容 = revision['*'] */
	content = CeL.wiki.content_of(page_data);

	if (!content)
		return;

	var matched;
	while (matched = PATTERN_link.exec(content)) {
		var foreign_title = matched[2]
		// e.g., [[:en:wikt:a|a]],
		.replace(/^[a-z\s]*:/, '').trim(), label = matched[3].trim();
		if (!foreign_title || !label || (foreign_title.length > label.length
		// 不處理各自包含者。
		? foreign_title.includes(label) : label.includes(foreign_title))
		// e.g., 法文版, 義大利文版
		|| label.endsWith('文版') || PATTERN_en.test(label))
			continue;

		foreign_title = matched[1] + ':' + foreign_title;
		if (!(foreign_title in label_hash)) {
			++count;
			if (count < log_limit)
				console.log(count + ': ' + matched[0] + ' @ [[' + title + ']]');
			label_hash[foreign_title] = [ label ];
			// source_hash[foreign_title] = [ title ];
		} else if (!label_hash[foreign_title].includes(label)) {
			label_hash[foreign_title].push(label);
			// source_hash[foreign_title].push(title);
		}
	}
}

var default_language = 'zh',
/** {Number}未發現之index。 const: 基本上與程式碼設計合一，僅表示名義，不可更改。(=== -1) */
NOT_FOUND = ''.indexOf('_');

function add_item(label) {
	var language = PATTERN_en.test(label) ? 'en' : default_language;
	return {
		language : language,
		value : label,
		add : 1
	};
}

/**
 * Finish up. 最後結束工作。
 */
function finish_work() {
	CeL.log('All ' + count + ' labels.');
	CeL.fs_write(base_directory + 'labels.json', JSON.stringify(label_hash));

	count = 0;
	for ( var full_title in label_hash) {
		foreign_title = full_title.match(/^([a-z]{2,}):(.+)$/);
		var language = foreign_title[1];
		foreign_title = foreign_title[2];

		wiki.data([ language, foreign_title ]).edit_data(function(entity) {
			if (++count > 2)
				throw 'test done';

			if ('missing' in entity)
				return;

			var labels = label_hash[full_title], has_label;
			if (entity.labels[default_language]) {
				has_label = labels.indexOf(
				// 去除重複 label。
				entity.labels[default_language].value);
				if (has_label !== NOT_FOUND) {
					labels.splice(has_label, 1);
					if (labels.length === 0)
						return;
					has_label = true;
				}
			}

			var data;
			// 若是本來已有 label，會被取代。
			if (has_label) {
				data = {};
			} else {
				data = {
					labels : [ add_item(labels[0]) ]
				};
				labels.shift();
			}
			if (labels.length > 0) {
				data.aliases = labels.map(add_item);
			}
		}, {
			bot : 1,
			summary : 'import label from link'
		});
	}
}

// ----------------------------------------------------------------------------

prepare_directory(base_directory);

// share the xml dump file.
if (typeof process === 'object') {
	process.umask(parseInt('0022', 8));
}

// CeL.set_debug(6);
CeL.wiki.traversal({
	wiki : wiki,
	// cache path prefix
	directory : base_directory,
	// 指定 dump file 放置的 directory。
	// dump_directory : bot_directory + 'dumps/',
	dump_directory : '/shared/dump/',
	// 若 config.filter 非 function，表示要先比對 dump，若修訂版本號相同則使用之，否則自 API 擷取。
	// 設定 config.filter 為 ((true)) 表示要使用預設為最新的 dump，否則將之當作 dump file path。
	filter : true,
	after : finish_work
}, for_each_page);
