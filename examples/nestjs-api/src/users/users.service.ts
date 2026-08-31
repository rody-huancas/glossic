import { Injectable } from "@nestjs/common";

import type { CreateUserDto } from "./dto/create-user.dto.js";
import type { User } from "./entities/user.entity.js";

@Injectable()
export class UsersService {
  private readonly users = new Map<string, User>();

  async findAll(): Promise<User[]> {
    return [...this.users.values()];
  }

  async findOne(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async create(dto: CreateUserDto): Promise<User> {
    const user: User = { id: crypto.randomUUID(), ...dto, createdAt: new Date() };
    this.users.set(user.id, user);
    return user;
  }
}
