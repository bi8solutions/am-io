import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import {AppRoutingModule} from "./app-routing.module";
import {RouterModule} from "@angular/router";
import {HomeModule} from "./home/home.module";
import {AmIoModule} from './modules/am-io/am-io.module';
import {HttpClientModule} from '@angular/common/http';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AmIoModule,
    AppRoutingModule,
    HttpClientModule,
    RouterModule,
    HomeModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
