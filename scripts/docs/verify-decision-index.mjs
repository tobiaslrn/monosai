#!/usr/bin/env node
/**
 * Every decision record appears in the chapter 9 index.
 *
 * The index drifted silently: it listed 54 of 55 records, and the one it had
 * dropped was linked from another record's amendment note, so a reader followed
 * a pointer to a decision the index said did not exist. Nothing failed. This
 * makes it fail.
 *
 * Numbers rather than filenames are compared, because two records deliberately
 * share the number 0028 and the index lists both by title under one link.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DECISIONS = path.join(process.cwd(), 'docs', 'decisions');
const INDEX = path.join(process.cwd(), 'docs', 'arc42', '09-architecture-decisions.md');

const files = (await readdir(DECISIONS)).filter((name) => name.endsWith('.md'));
const index = await readFile(INDEX, 'utf8');

const missing = [];
const unlinked = [];
for (const file of files) {
  const number = /^(\d{4})-/u.exec(file)?.[1];
  if (number === undefined) {
    console.error(`Decision record is not numbered: ${file}`);
    process.exit(1);
  }
  if (!new RegExp(`\\[${number}\\]\\(`, 'u').test(index)) {
    missing.push(file);
  } else if (!index.includes(`../decisions/${file}`) && !hasSharedNumber(files, number)) {
    unlinked.push(file);
  }
}

function hasSharedNumber(all, number) {
  return all.filter((name) => name.startsWith(`${number}-`)).length > 1;
}

if (missing.length > 0 || unlinked.length > 0) {
  for (const file of missing) {
    console.error(`Missing from the chapter 9 index: docs/decisions/${file}`);
  }
  for (const file of unlinked) {
    console.error(`Listed by number but not linked in chapter 9: docs/decisions/${file}`);
  }
  process.exit(1);
}

console.log(`decision index verified: ${String(files.length)} records listed in chapter 9`);
