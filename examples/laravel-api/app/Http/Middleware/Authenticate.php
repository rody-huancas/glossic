<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class Authenticate
{
    public function handle(Request $request, Closure $next)
    {
        if (! $request->bearerToken()) {
            abort(401, 'Unauthenticated.');
        }

        return $next($request);
    }
}
