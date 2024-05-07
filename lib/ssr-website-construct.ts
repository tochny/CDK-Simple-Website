import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface SSRWebsiteConstructOptions {
  /**
   * The domain name for the website
   */
  domainName: string;
  /**
   * The certificate to use for the website, must be in us-east-1 region
   */
  certificate: acm.ICertificate;
  allowMethods?: lambda.HttpMethod[];
  allowOrigins?: string[];
  allowHeaders?: string[];
  allowMethodsCloudFront?: cloudfront.AllowedMethods;
  responseHeadersPolicy?: cloudfront.ResponseHeadersPolicy;
  /**
   * If true, will output the distribution domain name as a CloudFormation output
   * @default false
   */
  cfnOutput?: boolean;
}

/**
 * A construct to create a serverless-side rendered website
 * @param scope a Construct, most likely a cdk.Stack created
 * @param id the id of the Construct to create, usually domain name
 * @param props properties from SSRWebsiteConstructOptions interface
 */
export class SSRWebsiteConstruct extends Construct {
  public readonly distribution: cloudfront.Distribution;
  private readonly functionUrl: lambda.IFunctionUrl;
  private readonly ssrLambda: lambda.Function;
  constructor(scope: Construct, id: string, options: SSRWebsiteConstructOptions) {
    super(scope, id);


    // Create a lambda function with function url and IAM auth

    const dockerfileDir = `artifacts/${options.domainName}`;

    const logGroup = new logs.LogGroup(this, `${options.domainName}-LogGroup`, {
        logGroupName: `/aws/lambda/${options.domainName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
    });


    this.ssrLambda = new lambda.DockerImageFunction(this, `${options.domainName}`, {
      code: lambda.DockerImageCode.fromImageAsset(dockerfileDir),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      environment: {
        PORT: '3001',
        AWS_LWA_PORT: '3001',
      },
      logGroup,
    });

    this.functionUrl = this.ssrLambda.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.AWS_IAM,
        cors: {
            allowedMethods: options.allowMethods ?? [lambda.HttpMethod.ALL],
            allowedOrigins: options.allowOrigins ?? ['*'],
            allowedHeaders: options.allowHeaders ?? ['*'],
        }
    });

    this.distribution = new cloudfront.Distribution(this, `${options.domainName}-Distribution`, {
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(this.functionUrl),
        allowedMethods: options.allowMethodsCloudFront ?? cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: new cloudfront.CachePolicy(this, `${options.domainName}-CachePolicy`, {
            cachePolicyName: `${options.domainName.replace(".","")}-CachePolicy`,
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            minTtl: cdk.Duration.days(1),
            defaultTtl: cdk.Duration.days(7),
            maxTtl: cdk.Duration.days(365),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
        }),
        responseHeadersPolicy: options.responseHeadersPolicy ?? cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      certificate: options.certificate,
      domainNames: [options.domainName],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    const cfnOriginalAccessControl = new cloudfront.CfnOriginAccessControl(this, `${options.domainName}-OAC`, {
      originAccessControlConfig: {
        name: `${options.domainName}-OAC`,
        originAccessControlOriginType: 'lambda',
        signingBehavior: 'always',
        signingProtocol: 'sigv4'
      }
    });

    const CfnDistribution = this.distribution.node.defaultChild as cloudfront.CfnDistribution;

    // Set the Origin Access Control ID
    CfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.OriginAccessControlId', cfnOriginalAccessControl.attrId);

    // Set Lambda function permission
    this.ssrLambda.addPermission(`${options.domainName}-CloudFrontServicePermission`, {
      principal: new iam.ServicePrincipal("cloudfront.amazonaws.com"),
      action: "lambda:InvokeFunctionUrl",
      sourceArn: `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${this.distribution.distributionId}`,
    });

    if (options.cfnOutput) {
      new cdk.CfnOutput(this, `${options.domainName}/DistributionDomainName`, {
        value: this.distribution.distributionDomainName,
      });
    }
  }
}
