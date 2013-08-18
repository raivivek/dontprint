(function() {


/**
 * This postTranslator is documented and serves as a sample for all
 * postTranslators. It handles articles from the arXiv preprint server.
 * Each postTranslator is implemented in a single function.
 * Dontprint.postTranslate() iterates through all postTranslators and
 * invoces them until it finds the first one that was able to handle the
 * article.
 * A post translator is invoced must do the following things in this order:
 * 1. Run a quick test to check if the article can be handled by this
 *    postTranslator. Since *all* postTranslators are invoced until a
 *    suitable one is found, this test should be cheap. In particular, it
 *    should not involve catching any remote resources. Usually, the test
 *    is done with a regExp on job.pageurl. If the test fails, the
 *    postProcessor returns. If the test passes,
 *    postProcessor continues and eventually throws new Task.Result(true)
 *    to stop Dontprint from applying any further postProcessors.
 * 2. Catch any necessary data and add or change attributes of job.
 *    If job.jobType==='page', job.document is set to a html document.
 *    This may be used in postProcessing. For other jobTypes, the document
 *    needs to be fetched and the fetched document should be stored in
 *    job.document for other postProcessors in case this postProcessor
 *    still fails.
 *    The following attributes of job may be added or changed:
 *    - journalLongname, journalShortname: will be used when searching the
 *      journals table; if these are changed, then prohibitSaveJournalSettings
 *      should most likely be set to true
 *    - prohibitSaveJournalSettings: if set to true, hide the checkbox to
 *      remember settings for this journal in the crop window
 *    - document: see comment above
 *    - adjustCropDefaults: a function that will be invoced after Dontprint
 *      found a match in the journals table. See below for documentation.
 * 3. Throw new Task.Result(true) to stop the iteration through all postProcessors.
 */
function arxivPostTranslator(job) {
	// 1. Check if this postProcessor applies.
	if (!job.pageurl || !job.pageurl.match(/^https?:\/\/(?:([^\.]+\.))?(arxiv\.org|xxx\.lanl\.gov)\/abs\//)) {
		return;
	}
	
	// 2. Catch data and set attributes of job.
	job.prohibitSaveJournalSettings = true;  // don't allow to save settings for arXiv
	job.adjustCropDefaults = function() {
		/* This function will be called after Dontprint has searched the journals
		 * table but before a crop page is shown, if any will be shown. Use cases
		 * include setting different crop parameters (see below) or setting
		 * job.crop.remember to false to force manual cropping (see below). */
		
		// If j.coverpage is set, this means that the PDF one could download from
		// the journal's web site has a cover page. But articles on arXiv never
		// have a cover page.
		job.crop.coverpage = false;
		
		// make sure the watermark with the arXiv identifier is cut off
		// TODO: convert 0.52 to mm when we use mm in data base
		job.crop.m1 = Math.max(job.crop.m1, 0.52);
		
		// Use crop settings only as a suggestion and always force manual cropping
		// on arXiv because the layout of the preprint may be different from
		// the layout in the journal.
		job.crop.remember = false;
	};
	
	if (yield getDocumentForJob(job)) {  // make sure job.document is set
		let jrefElements = job.document.getElementsByClassName("jref");
		if (jrefElements.length === 1) {
			let m = jrefElements[0].textContent.match(/^[^0-9,(]+/);
			if (m) {
				let journal = m[0].trim();
				if (journal !== "") {
					job.journalLongname = journal;
					job.journalShortname = journal;
				}
			}
		}
	}
	
	// Return true no matter whether or not we could find a journal reference
	// because we want to stop search for further postProcessors in any case.
	throw new Task.Result(true);
}


var postTranslators = [
	arxivPostTranslator
];


/**
 * This function is run just before Dontprint searches the journals
 * table in the database for matching entries. It enhances the journal
 * references for articles from some sources where Zotero doesn't set
 * them very well, e.g., preprint servers such as arXiv.
 * @return true if any postTranslator was applied, false otherwise.
 */
Dontprint.postTranslate = function(job) {
	for (let i=0; i<postTranslators.length; i++) {
		try {
			var match = yield postTranslators[i](job);
		} catch (e) {} // ignore
		
		if (job.state === "canceled") {
			throw "canceled";
		}
		if (match) {
			throw new Task.Result(true);
		}
	}
	
	throw new Task.Result(false);
};


/**
 * Utility function; makes sure that job.document is set. If it isn't, this
 * function catches the document from job.pageurl.
 * @return true on success (also if job.document was already set),
 *         false on failure
 */
function getDocumentForJob(job) {
	if (job.document) {
		// document already set; do nothing.
		throw new Task.Result(true);
	}
	if (!job.pageurl) {
		// Error: cannot download document; return false
		throw new Task.Result(false);
	}
	
	let deferred = Promise.defer();
	let req = new XMLHttpRequest();
	req.open("GET", job.pageurl, true);
	req.responseType="document";
	req.onload = function() {
		if (req.response) {
			deferred.resolve();
		} else {
			deferred.reject();
		}
	};
	req.onerror = deferred.reject;
	req.send();
	
	job.abortCurrentTask = function() {
		req.abort();
		deferred.reject();
	};
	setTimeout(deferred.reject, 10000);  // 10 seconds
	
	try {
		yield deferred.promise;
	} catch (e) {
		if (job.state === "canceled") {
			throw "canceled";
		}
		// download error; return false
		throw new Task.Result(false);
	} finally {
		delete job.abortCurrentTask;
	}
	
	job.document = req.response;
	throw new Task.Result(true);
}


}());