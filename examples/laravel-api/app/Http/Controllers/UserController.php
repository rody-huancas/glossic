<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(User::all());
    }

    public function store(Request $request): JsonResponse
    {
        $user = User::create($request->validate([
            'name' => 'required|string',
            'email' => 'required|email|unique:users',
        ]));

        return response()->json($user, 201);
    }
}
