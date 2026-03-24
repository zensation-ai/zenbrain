import { describe, it, expect, beforeEach } from 'vitest';
import { ShortTermMemory } from '../src/layers/short-term';

describe('ShortTermMemory', () => {
  let stm: ShortTermMemory;

  beforeEach(() => {
    stm = new ShortTermMemory({ maxInteractions: 5 });
  });

  it('should start a session', () => {
    const id = stm.startSession();
    expect(id).toBeTruthy();
    expect(stm.getSessionId()).toBe(id);
  });

  it('should add interactions', () => {
    stm.startSession();
    stm.addInteraction('user', 'Hello');
    stm.addInteraction('assistant', 'Hi there!');
    expect(stm.size).toBe(2);
  });

  it('should enforce sliding window', () => {
    stm.startSession();
    for (let i = 0; i < 8; i++) {
      stm.addInteraction('user', `Message ${i}`);
    }
    expect(stm.size).toBe(5);
    // Should keep the last 5
    const history = stm.getHistory();
    expect(history[0].content).toBe('Message 3');
    expect(history[4].content).toBe('Message 7');
  });

  it('should get recent interactions', () => {
    stm.startSession();
    for (let i = 0; i < 5; i++) {
      stm.addInteraction('user', `msg ${i}`);
    }
    const recent = stm.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].content).toBe('msg 3');
    expect(recent[1].content).toBe('msg 4');
  });

  it('should format as LLM messages', () => {
    stm.startSession();
    stm.addInteraction('user', 'What is FSRS?');
    stm.addInteraction('assistant', 'FSRS is a spaced repetition algorithm.');
    const messages = stm.toMessages();
    expect(messages).toEqual([
      { role: 'user', content: 'What is FSRS?' },
      { role: 'assistant', content: 'FSRS is a spaced repetition algorithm.' },
    ]);
  });

  it('should clear session', () => {
    stm.startSession();
    stm.addInteraction('user', 'test');
    stm.clear();
    expect(stm.size).toBe(0);
  });

  it('should accept custom session ID', () => {
    const id = stm.startSession('my-session-123');
    expect(id).toBe('my-session-123');
  });
});
