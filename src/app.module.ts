// import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { ConfigModule } from '@nestjs/config';
// import { SupabaseModule } from './supabase/supabase.module';
// import { AuthModule } from './auth/auth.module';
// import { AuthMiddleware } from './common/middleware/auth.middleware';

// @Module({
//   imports: [
//     ConfigModule.forRoot({ isGlobal: true }),
//     SupabaseModule,
//     AuthModule,
//   ],
//   controllers: [AppController],
//   providers: [AppService],
// })
// export class AppModule {
//   configure(consumer: MiddlewareConsumer) {
//     consumer
//       .apply(AuthMiddleware)
//       .forRoutes(
//         { path: 'auth/profile', method: RequestMethod.GET },
//         { path: 'account', method: RequestMethod.ALL },
//       );
//   }
// }
export class AppModule {}
