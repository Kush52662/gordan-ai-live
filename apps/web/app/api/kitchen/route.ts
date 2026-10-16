import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { agentContext, requestedRecipe } from '@/lib/kitchen/context';
import { Unauthorized, requestOwner } from '@/lib/kitchen/identity';
import { Conflict, ingredientCheck } from '@/lib/kitchen/model';
import { isSameOrigin } from '@/lib/kitchen/request';
import { changeKitchen, readKitchen } from '@/lib/kitchen/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function errorResponse(error: unknown) {
  if (error instanceof Unauthorized)
    return NextResponse.json({ error: error.message }, { status: 401 });
  const status = error instanceof Conflict ? 409 : error instanceof ZodError ? 400 : 422;
  return NextResponse.json(
    {
      error:
        error instanceof ZodError
          ? error.issues.map((i) => i.message).join('; ')
          : error instanceof Error
            ? error.message
            : 'Could not save. Please retry.',
    },
    { status }
  );
}
export async function GET(request: Request) {
  try {
    const state = await readKitchen(await requestOwner(request));
    const query = new URL(request.url).searchParams;
    const recipeId = query.get('recipeId');
    if (recipeId) {
      const recipe = requestedRecipe(state, recipeId);
      if (!recipe) return NextResponse.json({ error: 'Recipe not found.' }, { status: 404 });
      return NextResponse.json(
        {
          revision: state.revision,
          recipe,
          ingredientCheck: ingredientCheck(state, recipeId, recipe),
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(query.get('view') === 'agent' ? agentContext(state) : state, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request) && !request.headers.has('authorization'))
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json'))
    return NextResponse.json({ error: 'JSON required.' }, { status: 415 });
  if (Number(request.headers.get('content-length')) > 250000)
    return NextResponse.json({ error: 'Recipe is too large.' }, { status: 413 });
  try {
    const raw = await request.text();
    if (raw.length > 250000)
      return NextResponse.json({ error: 'Recipe is too large.' }, { status: 413 });
    const state = await changeKitchen(await requestOwner(request), JSON.parse(raw));
    return NextResponse.json(
      new URL(request.url).searchParams.get('view') === 'agent' ? agentContext(state) : state,
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (e) {
    return errorResponse(e);
  }
}
