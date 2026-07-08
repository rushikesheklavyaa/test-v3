/**
 * syllabus.js
 * Teacher-side Syllabus Coverage Tracker: add chapters per
 * Standard + Board + Subject, mark them Completed/Pending with a date,
 * and see per-subject completion progress. Students/parents see the
 * same data read-only from student.js.
 */

import { apiGet, apiPost } from './api.js?v=2';
import { CONFIG } from './config.js?v=2';
import {
  showToast, showLoading, closeLoading, confirmAction, getTeacherSession,
  todayISO, qs, qsa, populateSelect
} from './utils.js?v=2';

export function initSyllabusModule() {
  populateSelect(qs('#syllabusStandard'), CONFIG.STANDARDS, 'All standards');
  populateSelect(qs('#syllabusBoard'), CONFIG.BOARDS, 'All boards');
  populateSelect(qs('#chapterStandard'), CONFIG.STANDARDS, 'Select standard');
  populateSelect(qs('#chapterBoard'), CONFIG.BOARDS, 'Select board');

  qs('#loadSyllabusBtn').addEventListener('click', loadSyllabus);
  qs('#addChapterBtn').addEventListener('click', openAddChapterModal);
  qs('#closeAddChapterModal').addEventListener('click', closeAddChapterModal);
  qs('#cancelAddChapterModal').addEventListener('click', closeAddChapterModal);
  qs('#addChapterModal').addEventListener('click', (e) => {
    if (e.target.id === 'addChapterModal') closeAddChapterModal();
  });
  qs('#addChapterForm').addEventListener('submit', handleAddChapter);
}

function openAddChapterModal() {
  // Pre-fill standard/board from the current filter, if one is selected —
  // saves a step when adding several chapters for the same class in a row.
  qs('#chapterStandard').value = qs('#syllabusStandard').value || '';
  qs('#chapterBoard').value = qs('#syllabusBoard').value || '';
  qs('#chapterSubject').value = qs('#syllabusSubjectFilter').value || '';
  qs('#chapterNo').value = '';
  qs('#chapterName').value = '';
  qs('#chapterPlannedDate').value = '';
  qs('#addChapterModal').classList.add('active');
}

function closeAddChapterModal() {
  qs('#addChapterModal').classList.remove('active');
}

async function handleAddChapter(e) {
  e.preventDefault();
  const teacher = getTeacherSession();

  const standard = qs('#chapterStandard').value;
  const board = qs('#chapterBoard').value;
  const subject = qs('#chapterSubject').value.trim();
  const chapterName = qs('#chapterName').value.trim();

  if (!standard || !board || !subject || !chapterName) {
    showToast('Please fill standard, board, subject and chapter name.', 'warning');
    return;
  }

  showLoading('Adding chapter...');
  const result = await apiPost('addSyllabusChapter', {
    standard,
    board,
    subject,
    chapterNo: qs('#chapterNo').value,
    chapterName,
    plannedDate: qs('#chapterPlannedDate').value,
    updatedBy: teacher ? teacher.name : 'Teacher'
  });
  closeLoading();

  if (result.success) {
    showToast('Chapter added.', 'success');
    closeAddChapterModal();
    // Reflect the newly added chapter's class in the filter bar and reload.
    qs('#syllabusStandard').value = standard;
    qs('#syllabusBoard').value = board;
    loadSyllabus();
  } else {
    showToast(result.message || 'Could not add chapter.', 'error');
  }
}

async function loadSyllabus() {
  const standard = qs('#syllabusStandard').value;
  const board = qs('#syllabusBoard').value;
  const subject = qs('#syllabusSubjectFilter').value.trim();
  const area = qs('#syllabusResultArea');

  if (!standard || !board) {
    showToast('Please choose both a standard and a board.', 'warning');
    return;
  }

  area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading syllabus...</p></div>`;

  const result = await apiGet('getSyllabus', { standard, board, subject });
  if (!result.success) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(result.message || 'Could not load syllabus.')}</p></div>`;
    return;
  }

  renderSyllabus(result.subjects || []);
}

function renderSyllabus(subjects) {
  const area = qs('#syllabusResultArea');

  if (!subjects.length) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-book-open"></i><p>No chapters added yet for this class. Click "Add Chapter" to get started.</p></div>`;
    return;
  }

  area.innerHTML = subjects.map((s) => `
    <div class="syllabus-subject-card">
      <div class="syllabus-subject-header">
        <div>
          <div class="syllabus-subject-name">${escapeHtml(s.subject)}</div>
          <div class="syllabus-subject-sub">${s.completed} of ${s.total} chapters completed</div>
        </div>
        <div class="syllabus-progress-pct">${s.percent}%</div>
      </div>
      <div class="syllabus-progress-track">
        <div class="syllabus-progress-fill" style="width:${s.percent}%;"></div>
      </div>
      <div class="syllabus-chapter-list">
        ${s.chapters.map((c) => renderChapterRow(c)).join('')}
      </div>
    </div>
  `).join('');

  qsa('[data-toggle-syllabus]').forEach((btn) => {
    btn.addEventListener('click', () => toggleChapterStatus(btn.dataset.toggleSyllabus, btn.dataset.currentStatus));
  });
  qsa('[data-delete-syllabus]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteChapter(btn.dataset.deleteSyllabus, btn.dataset.chapterName));
  });
}

function renderChapterRow(c) {
  const isCompleted = String(c.Status) === 'Completed';
  return `
    <div class="syllabus-chapter-row ${isCompleted ? 'is-completed' : ''}">
      <button class="syllabus-check ${isCompleted ? 'checked' : ''}" data-toggle-syllabus="${escapeHtml(c.SyllabusID)}" data-current-status="${escapeHtml(c.Status)}" title="${isCompleted ? 'Mark as pending' : 'Mark as completed'}">
        <i class="fa-solid ${isCompleted ? 'fa-check' : ''}"></i>
      </button>
      <div class="syllabus-chapter-info">
        <div class="syllabus-chapter-name">${c.ChapterNo ? `Ch. ${escapeHtml(c.ChapterNo)} — ` : ''}${escapeHtml(c.ChapterName)}</div>
        <div class="syllabus-chapter-meta">
          ${c.PlannedDate ? `Planned: ${escapeHtml(c.PlannedDate)}` : ''}
          ${isCompleted && c.CompletedDate ? `${c.PlannedDate ? ' &middot; ' : ''}Completed: ${escapeHtml(c.CompletedDate)}` : ''}
        </div>
      </div>
      <span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">${isCompleted ? 'Completed' : 'Pending'}</span>
      <button class="btn-icon" data-delete-syllabus="${escapeHtml(c.SyllabusID)}" data-chapter-name="${escapeHtml(c.ChapterName)}" title="Delete chapter">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `;
}

async function toggleChapterStatus(syllabusId, currentStatus) {
  const teacher = getTeacherSession();
  const newStatus = currentStatus === 'Completed' ? 'Pending' : 'Completed';

  const result = await apiPost('updateSyllabusStatus', {
    syllabusId,
    status: newStatus,
    completedDate: newStatus === 'Completed' ? todayISO() : '',
    updatedBy: teacher ? teacher.name : 'Teacher'
  });

  if (result.success) {
    loadSyllabus();
  } else {
    showToast(result.message || 'Could not update chapter.', 'error');
  }
}

async function handleDeleteChapter(syllabusId, chapterName) {
  const confirmed = await confirmAction({
    title: 'Delete this chapter?',
    text: `"${chapterName}" will be permanently removed from the syllabus tracker.`,
    confirmText: 'Yes, delete'
  });
  if (!confirmed) return;

  showLoading('Deleting chapter...');
  const result = await apiPost('deleteSyllabusChapter', { syllabusId });
  closeLoading();

  if (result.success) {
    showToast('Chapter removed.', 'success');
    loadSyllabus();
  } else {
    showToast(result.message || 'Could not delete chapter.', 'error');
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
