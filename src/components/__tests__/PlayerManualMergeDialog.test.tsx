import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
import PlayerManualMergeDialog from '../PlayerManualMergeDialog';

const primary = { id: 'primary', nameHe: 'עידן ברנס', nameEn: 'I. Barnes', updatedAt: '2026-09-29T10:00:00.000Z', birthDate: null, position: null, nationalityHe: null, nationalityEn: null, photoUrl: null, firstNameHe: null, firstNameEn: null, lastNameHe: null, lastNameEn: null, events: 3, lineups: 5 };
const secondary = { ...primary, id: 'secondary', nameEn: 'Idan Baranes', birthDate: '2004-03-26', events: 0, lineups: 0 };

it('renders the primary choice, missing field preview and confirmation control', () => {
  const html = renderToStaticMarkup(<PlayerManualMergeDialog left={primary} right={secondary} />);
  for (const text of ['איחוד ידני', 'רשומה ראשית', 'תאריך לידה', 'תצוגה מקדימה', 'אישור איחוד']) expect(html).toContain(text);
});
