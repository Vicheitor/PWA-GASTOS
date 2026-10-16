import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configError } from '../js/setup.js';

const fakeJwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.firma`;
const url = 'https://ejemplo.supabase.co';

test('acepta anon key (JWT) y publishable key', () => {
  assert.equal(configError({ supabaseUrl: url, supabaseAnonKey: fakeJwt('anon') }), '');
  assert.equal(configError({ supabaseUrl: url, supabaseAnonKey: 'sb_publishable_abc123' }), '');
});

test('rechaza la service_role / secret key', () => {
  assert.match(configError({ supabaseUrl: url, supabaseAnonKey: fakeJwt('service_role') }), /secreta/);
  assert.match(configError({ supabaseUrl: url, supabaseAnonKey: 'sb_secret_abc123' }), /secreta/);
});

test('rechaza placeholder, clave basura y URLs que no son de Supabase', () => {
  assert.match(configError({ supabaseUrl: url, supabaseAnonKey: 'TU_ANON_KEY' }), /Falta/);
  assert.match(configError({ supabaseUrl: url, supabaseAnonKey: 'hola' }), /no parece/);
  assert.match(configError({ supabaseUrl: 'http://ejemplo.supabase.co', supabaseAnonKey: fakeJwt('anon') }), /https/);
  assert.match(configError({ supabaseUrl: 'https://evil.example.com', supabaseAnonKey: fakeJwt('anon') }), /https/);
  assert.match(configError(undefined), /Falta/);
});
