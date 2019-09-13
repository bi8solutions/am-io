import {ConnectableObservable, defer, Observable, Subscribable, Subscription, Unsubscribable} from "rxjs";
import {Subject} from "rxjs/Subject";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {filter, publish, takeUntil, takeWhile, tap} from "rxjs/operators";
import {OperatorFunction} from "rxjs/interfaces";
import {toSubscriber} from "rxjs/internal-compatibility";
import {UUID} from "angular2-uuid";
import {pipeFromArray} from 'rxjs/internal/util/pipe';

//-----[ CHANNEL ]--------------------------------------------------------------------------------------------------------------------------

/**
 *
 */
export interface ICreateFn<A = {}, T = {}> {
  (input?: A): Observable<T>;
}

/**
 *
 */
export interface ICreateMapFn<D = {}, A = {}> {
  (input?: D | A): A;
}

/**
 *
 */
export class CreateOptions<A = {}, T = {}, D = {}> {
  new: ICreateFn<A, T>;             // the function that will create the observable
  map?: ICreateMapFn<D, A>;         // function to map the input that is used by the new function as a parameter
  defer?: boolean = false;           // if true, will apply the defer operator that will only call the observable when you subscribe to it
}

/**
 *
 */
export enum EventType {
  on_init = 'init',

  on_next = 'on_next',                      // when next is called on the channel (inout to be passed to the create function)
  on_input_complete = 'on_input_complete',  // when the created observable completes - it does not mean that we pass complete to any of the channel observers
  on_observe = 'on_observe',                // when a channel is observed - it does not mean that they have subscribed yet
  on_complete = 'on_complete',              // when the created observable completes - it does not mean that we pass complete to any of the channel observers
  on_emit = 'on_emit',                      // when values are send directly to the output subject effectively skipping create or next

  error_next = 'error_next',                // when there is an error on the inpout subject/stream
  error_map = 'error_map',                  // when there is an error mapping the input value to the observable create function
  error_create = 'complete',                // when there was an error creating the observable
  error_observe = 'error_observe',          // when there was an error during the observe phase (like in a pipe)

  on_connect = 'on_connect',                // when the channel connects
  on_subscribe = 'on_subscribe',            // when a channel is subscribed to (after calling observe)

  on_open = 'on_open',                      // when the channel is opened, meaning that you can call next on it
  on_close = 'on_close',                    // when the channel is closed / discarded (cannot use it after closing a channel)

  on_enable = 'on_enable',                  // when a channel is enabled (meaning that calling next will push items to the observable)
  on_disable = 'on_disable'                 // when a channel is disabled (meaning that we will simply ignore next - discard any inputs)
}

export type ErrorType =
  EventType.error_next |
  EventType.error_map |
  EventType.error_create |
  EventType.error_observe;

export type StatusType =
  EventType.on_init |
  EventType.on_connect |
  EventType.on_subscribe |
  EventType.on_open |
  EventType.on_close |
  EventType.on_enable |
  EventType.on_disable |
  EventType.on_input_complete;

export type ObserveType =
  EventType.on_next |
  EventType.on_observe |
  EventType.on_complete |
  EventType.on_emit;

/**
 *
 */
export interface Event {
  channel?: IChannel<any, any, any>
  statusType?: StatusType,
  errorType?: ErrorType,
  observeType?: ObserveType,
  value?: any,
  error?: any
}

/**
 *
 */
export interface EventFn {
  (event: Event): void
}

/**
 *
 */
export interface IChannel<A = {}, T = {}, D = {}> extends Subscribable<T> {
  next(value?: A);

  error(err: any);

  complete();

  close();

  emit(value: T): void;

  observe(value?: A, ...ops: OperatorFunction<any, any>[]): IChannel<any, any, any>;

  enable(): IChannel<A, T, D>;

  disable(): IChannel<A, T, D>;

  asObservable(): Observable<T>;

  asEventObservable(): Observable<Event>;
}

/**
 *
 */
export type DebugOptions = { verbose: boolean } | boolean;

/**
 *
 */
export abstract class BaseChannel<A = {}, T = {}, D = {}> implements IChannel<A, T, D> {
  closed: boolean = false;
  protected ready: boolean = false;
  protected enabled: boolean = false;
  protected events$: BehaviorSubject<Event>;
  protected shieldsUp$ = new Subject<any>();

  constructor(protected debugOptions: DebugOptions, protected eventFn?: EventFn, protected cold?: boolean, public readonly key?: any) {
    this.key = this.key || UUID.UUID();
  }

  protected init() {
    this.setupEvents();
    this.setupSubjects();
    this.enable();
    this.ready = true;
  }

  protected setupEvents() {
    this.events$ = new BehaviorSubject<Event>({
      channel: this,
      statusType: EventType.on_init
    });
  }

  protected abstract setupSubjects();

  protected emitEvent(event: Event) {
    event.channel = this;

    if (this.debugOptions) {
      if (event.errorType) {
        console.error(`[${this.key}:${event.errorType}] `,
          (typeof this.debugOptions !== 'boolean') && this.debugOptions.verbose ? event.error || '' : '');
      } else {
        console.debug(`[${this.key}:${event.statusType || event.observeType}] `,
          (typeof this.debugOptions !== 'boolean') && this.debugOptions.verbose ? event.value || '' : '');
      }
    }

    try {
      if (this.eventFn) {
        this.eventFn(event);
      }
    } catch (err) {
      console.log(err);

    } finally {
      this.events$.next(event);
    }
  }

  asEventObservable(): Observable<Event> {
    return this.events$.asObservable().pipe(takeUntil(this.shieldsUp$));
  }

  close() {
    this.closed = true;
    this.shieldsUp$.next();
  }

  disable(): IChannel<A, T, D> {
    this.enabled = false;
    return this;
  }

  enable(): IChannel<A, T, D> {
    this.enabled = true;
    return this;
  }

  abstract complete();

  abstract asObservable(): Observable<T>;

  abstract emit(value: T): void;

  abstract error(err: any): void;

  abstract next(value?: A): void;

  abstract observe(value?: any, ...ops: OperatorFunction<any, any>[]): IChannel;

  abstract subscribe(observerOrNext?: any |
                       ((value: T) => void), error?: (error: any) => void, complete?: () => void,
                     ...ops: OperatorFunction<any, any>[]): Unsubscribable;
}

/**
 *
 */
export interface ChannelOptions<A = {}, T = {}, D = {}> {
  key?: any,
  create?: CreateOptions<A, T, D>,
  input?: Subject<A>,
  output?: Subject<T>,
  debug?: DebugOptions;
  eventFn?: EventFn,
  cold?: boolean
}

/**
 *
 */
export class Channel<A = {}, T = {}, D = {}> extends BaseChannel<A, T, D> {
  protected input$: Subject<A>;
  protected output$: Subject<T>;
  protected createOptions: CreateOptions<A, T, D>;
  private observerMap: Map<any, Channel>;

  constructor(options?: ChannelOptions<A, T, D>) {
    if (options) {
      super(options.debug || false, options.eventFn, options.cold || false, options.key);
      this.createOptions = options.create;
      this.input$ = options.input;
      this.output$ = options.output;
    } else {
      super(false);
    }

    this.observerMap = new Map<any, Channel>();
    this.init();
  }

  protected setupSubjects() {
    this.input$ = this.input$ || new Subject<A>();
    this.output$ = this.output$ || new BehaviorSubject<T>(null);

    this.input$.pipe(
      takeWhile((value: A) => {
        return !this.closed;
      }),
      filter((value: A) => {
        return this.enabled;
      }),
      tap((value) => this.emitEvent({
        observeType: EventType.on_next,
        value: value
      })),
    ).subscribe({
      next: (value: any) => {
        try {
          let shieldsUp = takeUntil(this.shieldsUp$); // listen to the Scotty, we are done here ...
          let takeMeOn = takeWhile((value: A) => !this.closed); // make sure everything completes (if next is called ...) - Wham!!!
          let eventTappet = tap({
            next: (value) => this.emitEvent({observeType: EventType.on_observe, value: value}),
            error: (err) => this.emitEvent({errorType: EventType.error_observe, error: err}),
            complete: () => this.emitEvent({observeType: EventType.on_complete})
          });

          let observable = this.createOptions
            ? actionObservable(this.createOptions, value) : new Observable((sub) => {
              sub.next(value);
              sub.complete();
            });

          // if the channel is cold, it means that we only do this once and everything completes as per normal
          if (this.cold) {
            observable.pipe(shieldsUp, takeMeOn, eventTappet).subscribe(this.output$);

          } else {
            // if it's hot, we don't propagate any complete or error events so that everyone stays subscribed until we complete the channel
            observable.pipe(shieldsUp, takeMeOn, eventTappet).subscribe({
              next: (value: T) => this.output$.next(value),
              error: (err) => {
              },
              complete: () => {
              }
            });
          }
        } catch (err) {
          this.emitEvent({errorType: EventType.error_create, error: err});
        }
      },
      error: (err: any) => {
        this.emitEvent({errorType: EventType.error_next, error: err});
        this.output$.error(err);
      },
      complete: () => {
        this.emitEvent({statusType: EventType.on_input_complete});
        this.output$.complete();
      }
    });
  }

  asObservable(): Observable<T> {
    return this.output$.asObservable();
  }

  complete() {
    this.input$.complete();
  }

  emit(value: T): void {
    this.output$.next(value);
  }

  error(err: any): any {
    this.input$.error(err);
  }

  next(value?: A): any {
    this.input$.next(value);
  }

  observe(options?: ChannelOptions, ...ops: OperatorFunction<any, any>[]): Channel {
    let channel = new Channel(options);
    this.subscribe(channel, ...ops);
    this.observerMap.set(channel.key, channel);
    return channel;
  }

  subscribe(observerOrNext?: any | ((value: T) => void), error?: (error: any) => void, complete?: () => void, ...ops: OperatorFunction<any, any>[]): Subscription {
    return this.output$.pipe(pipeFromArray([...ops])).subscribe(toSubscriber(observerOrNext, error, complete));
  }
}

//-----[ CHANNEL SWITCH  ]--------------------------------------------------------------------------------------------------------------------------

export class ChannelSwitch {
  private channelMap = new Map<any, Channel>();

  constructor(...channels: Channel[]) {
    this.add(...channels);
  }

  add(...channels: Channel[]) {
    channels.forEach((channel) => {
      this.channelMap.set(channel.key, channel);
    })
  }

  remove(...keys: any[]) {
    keys.forEach((key) => {
      this.channelMap.delete(key);
    })
  }

  complete(...keys: any[]) {
    keys.forEach((key) => {
      let channel = this.channelMap.get(key);
      if (channel) {
        channel.complete()
      }
    });
  }

  enable(...keys: any[]) {
    keys.forEach((key) => {
      let channel = this.channelMap.get(key);
      if (channel) {
        channel.enable()
      }
    });
  }

  disable(...keys: any[]) {
    keys.forEach((key) => {
      let channel = this.channelMap.get(key);
      if (channel) {
        channel.disable()
      }
    });
  }

  close() {
    Array.from(this.channelMap.entries()).forEach((entry: [any, Channel]) => {
      entry[1].close()
    });
  }
}

//-----[ FACTORY FUNCTIONS ]------------------------------------------------------------------------------------------------------------------------

/**
 *
 * @param arg
 * @param value
 */
export function actionObservable<A = {}, T = {}, D = {}>(arg: CreateOptions<A, T, D> | ICreateFn<A, T>, value: A): Observable<T> {
  if ((arg as any).new) {
    let options = (arg as CreateOptions<A, T, D>);
    return options.defer ? defer(() => options.map ? options.new(options.map(value)) : options.new(value))
      : options.map ? options.new(options.map(value)) : options.new(value);
  } else {
    return (arg as ICreateFn<A, T>)();
  }
}

/**
 *
 * @param arg
 */
export function publishedActionObservable<A = {}, T = {}, D = {}>(arg: CreateOptions<A, T, D> | ICreateFn<A, T>): ConnectableObservable<T> {
  if (arg instanceof CreateOptions) {
    let options = (arg as CreateOptions<A, T, D>);
    return (options.defer ? defer(() => options.map ? options.new(options.map()) : options.new())
      : options.map ? options.new(options.map()) : options.new()) as ConnectableObservable<T>;
  } else {
    return (arg as ICreateFn<A, T>)().pipe(publish()) as ConnectableObservable<T>;
  }
}
