import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { CreateUserDto } from "./dto/create-user.dto.js";
import type { User } from "./entities/user.entity.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(): Promise<User[]> {
    return this.users.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<User | undefined> {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto): Promise<User> {
    return this.users.create(dto);
  }
}
