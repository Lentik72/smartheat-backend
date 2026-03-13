/**
 * County ZIP Filter — client-side supplier filtering by ZIP code
 * Reads window.__supplierZips (JSON map: supplierId → [zips])
 * Filters <tr data-supplier-id> rows in the supplier table
 */
(function() {
  'use strict';

  var input = document.getElementById('zip-filter-input');
  var btn = document.getElementById('zip-filter-btn');
  var clearBtn = document.getElementById('zip-filter-clear');
  var result = document.getElementById('zip-filter-result');
  var table = document.querySelector('.supplier-table');

  if (!input || !btn || !table) return;

  var zipMap = window.__supplierZips || {};
  var countyName = window.__countyName || '';

  function filterByZip() {
    var zip = input.value.trim();
    if (!/^\d{5}$/.test(zip)) {
      result.textContent = 'Enter a 5-digit ZIP code';
      result.hidden = false;
      result.className = 'zip-filter-result zip-filter-no-match';
      return;
    }

    var rows = table.querySelectorAll('tbody tr');
    var matchCount = 0;

    // Find which suppliers serve this ZIP
    var matchingIds = {};
    for (var id in zipMap) {
      if (zipMap[id].indexOf(zip) !== -1) {
        matchingIds[id] = true;
      }
    }

    var hasMatches = Object.keys(matchingIds).length > 0;

    rows.forEach(function(row) {
      var sid = row.getAttribute('data-supplier-id');
      // Suppliers not in map (service_counties fallback) always stay visible
      if (!sid || !(sid in zipMap)) {
        row.hidden = false;
        matchCount++;
        return;
      }
      if (matchingIds[sid]) {
        row.hidden = false;
        matchCount++;
      } else {
        row.hidden = true;
      }
    });

    if (!hasMatches) {
      // No ZIP match — show all rows with message
      rows.forEach(function(row) { row.hidden = false; });
      result.textContent = 'ZIP ' + zip + ' not found \u2014 showing all ' + countyName + ' County suppliers';
      result.className = 'zip-filter-result zip-filter-no-match';
    } else {
      result.textContent = matchCount + ' supplier' + (matchCount !== 1 ? 's' : '') + ' deliver to ' + zip;
      result.className = 'zip-filter-result';
    }
    result.hidden = false;
    clearBtn.hidden = false;

    if (window.gtag) {
      gtag('event', 'zip_filter', { zip: zip, matches: matchCount });
    }
  }

  function clearFilter() {
    input.value = '';
    table.querySelectorAll('tbody tr').forEach(function(row) { row.hidden = false; });
    result.hidden = true;
    clearBtn.hidden = true;
  }

  btn.addEventListener('click', filterByZip);
  clearBtn.addEventListener('click', clearFilter);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      filterByZip();
    }
  });
})();
